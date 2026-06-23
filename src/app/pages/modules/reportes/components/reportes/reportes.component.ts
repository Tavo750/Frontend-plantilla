import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';
import { EnvioService, EnvioMaletas, SpringPage } from '../../../../../core/services/envio.service';
import { ApiResponse } from '../../../../../core/interfaces/api-response.interface';

interface KpiCard {
  label: string;
  value: string | number;
  icon: string;
  color: string;
  sub?: string;
}

interface BarItem {
  label: string;
  count: number;
  porcentaje: number;
  color: string;
}

@Component({
  selector: 'app-reportes',
  standalone: false,
  templateUrl: './reportes.component.html',
  styleUrl: './reportes.component.css'
})
export class ReportesComponent implements OnInit {

  cargando = true;
  error = false;
  cargandoPaginas = false;   // true mientras se cargan páginas adicionales
  totalRegistros = 0;        // total real de la BD (de totalElements)
  envios: EnvioMaletas[] = [];

  // KPIs
  kpis: KpiCard[] = [];

  // Gráficas
  porEstado: BarItem[] = [];
  porAerolinea: BarItem[] = [];
  topRutas: BarItem[] = [];
  porPrioridad: BarItem[] = [];

  // Tabla
  enviosFiltrados: EnvioMaletas[] = [];

  readonly ESTADO_COLORS: Record<string, string> = {
    REGISTRADA:   '#3b82f6',
    EN_TRANSITO:  '#f59e0b',
    ENTREGADA:    '#10b981',
    RETRASADA:    '#ef4444',
    EN_ESPERA:    '#8b5cf6'
  };

  constructor(
    private readonly envioService: EnvioService,
    private readonly messageService: MessageService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    this.error = false;
    this.envios = [];

    // 1. Cargar primera página para conocer totalPages
    this.envioService.listarEnviosPaginado(0, 200).subscribe({
      next: (resp: ApiResponse<SpringPage<EnvioMaletas>>) => {
        const page0 = resp.data;
        this.totalRegistros = page0.totalElements;
        this.envios = [...page0.content];

        if (page0.last) {
          // Sólo había una página
          this.enviosFiltrados = [...this.envios];
          this.calcularEstadisticas();
          this.cargando = false;
          this.cdr.detectChanges();
          return;
        }

        // 2. Cargar el resto de páginas en paralelo
        this.cargandoPaginas = true;
        this.cargando = false;
        this.cdr.detectChanges();

        const restantes = Array.from(
          { length: page0.totalPages - 1 },
          (_, i) => this.envioService.listarEnviosPaginado(i + 1, 200)
        );

        forkJoin(restantes).subscribe({
          next: (pages: ApiResponse<SpringPage<EnvioMaletas>>[]) => {
            pages.forEach(p => this.envios.push(...p.data.content));
            this.enviosFiltrados = [...this.envios];
            this.calcularEstadisticas();
            this.cargandoPaginas = false;
            this.cdr.detectChanges();
          },
          error: () => {
            // Mostrar con lo que hay si alguna página falla
            this.enviosFiltrados = [...this.envios];
            this.calcularEstadisticas();
            this.cargandoPaginas = false;
            this.cdr.detectChanges();
          }
        });
      },
      error: () => {
        this.error = true;
        this.cargando = false;
        this.cdr.detectChanges();
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los datos de reportes.'
        });
      }
    });
  }

  private calcularEstadisticas(): void {
    const total = this.envios.length;
    const totalMaletas = this.envios.reduce((s, e) => s + e.cantidad, 0);
    const entregados = this.envios.filter(e => e.estado === 'ENTREGADA').length;
    const retrasados  = this.envios.filter(e => e.estado === 'RETRASADA').length;
    const pctEnt  = total ? Math.round(entregados / total * 100) : 0;
    const pctRet  = total ? Math.round(retrasados  / total * 100) : 0;

    this.kpis = [
      { label: 'Total Envíos',    value: total,                        icon: 'pi pi-box',                  color: '#2563eb', sub: `${totalMaletas.toLocaleString()} maletas en total` },
      { label: 'Tasa de Entrega', value: `${pctEnt}%`,                 icon: 'pi pi-check-circle',         color: '#16a34a', sub: `${entregados} envíos entregados` },
      { label: 'Retrasados',      value: `${retrasados}`,              icon: 'pi pi-exclamation-triangle', color: '#dc2626', sub: pctRet > 0 ? `${pctRet}% del total` : 'Sin retrasos' },
      { label: 'Total Maletas',   value: totalMaletas.toLocaleString(), icon: 'pi pi-tag',                 color: '#7c3aed', sub: `Promedio ${total > 0 ? (totalMaletas / total).toFixed(1) : 0} por envío` }
    ];

    // ── Por estado ───────────────────────────────────────────
    const ESTADOS = ['REGISTRADA', 'EN_TRANSITO', 'ENTREGADA', 'RETRASADA', 'EN_ESPERA'];
    const cntEstado = ESTADOS.map(s => this.envios.filter(e => e.estado === s).length);
    const maxEst = Math.max(...cntEstado, 1);
    this.porEstado = ESTADOS
      .map((s, i) => ({
        label: s.replace(/_/g, ' '),
        count: cntEstado[i],
        porcentaje: Math.round(cntEstado[i] / maxEst * 100),
        color: this.ESTADO_COLORS[s] ?? '#94a3b8'
      }))
      .filter(i => i.count > 0);

    // ── Por aerolínea (top 5) ────────────────────────────────
    const byAerol = new Map<string, number>();
    this.envios.forEach(e => {
      const k = e.aerolinea?.nombre ?? 'Desconocida';
      byAerol.set(k, (byAerol.get(k) ?? 0) + 1);
    });
    const maxAerol = Math.max(...byAerol.values(), 1);
    this.porAerolinea = [...byAerol.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({
        label, count,
        porcentaje: Math.round(count / maxAerol * 100),
        color: '#3b82f6'
      }));

    // ── Top rutas (top 5) ────────────────────────────────────
    const byRuta = new Map<string, number>();
    this.envios.forEach(e => {
      const k = `${e.aeropuertoOrigen?.codigoOaci ?? '?'} → ${e.aeropuertoDestino?.codigoOaci ?? '?'}`;
      byRuta.set(k, (byRuta.get(k) ?? 0) + 1);
    });
    const maxRuta = Math.max(...byRuta.values(), 1);
    this.topRutas = [...byRuta.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({
        label, count,
        porcentaje: Math.round(count / maxRuta * 100),
        color: '#f59e0b'
      }));

    // ── Por prioridad ────────────────────────────────────────
    const byPrior = new Map<number, number>();
    this.envios.forEach(e => {
      byPrior.set(e.prioridad, (byPrior.get(e.prioridad) ?? 0) + 1);
    });
    const maxPrior = Math.max(...byPrior.values(), 1);
    this.porPrioridad = [...byPrior.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([p, count]) => ({
        label: `Prioridad ${p}`,
        count,
        porcentaje: Math.round(count / maxPrior * 100),
        color: '#8b5cf6'
      }));
  }

  // ── Filtros ──────────────────────────────────────────────────
  textoBusqueda   = '';
  estadoFiltro    = '';
  fechaRango:     Date[] = [];

  onBuscar(event: Event): void {
    this.textoBusqueda = (event.target as HTMLInputElement).value;
    this.aplicarFiltros();
  }

  onEstadoCambia(): void { this.aplicarFiltros(); }

  onFechaCambia(): void { this.aplicarFiltros(); }

  aplicarFiltros(): void {
    let lista = [...this.envios];
    const txt = this.textoBusqueda.toLowerCase();
    if (txt) {
      lista = lista.filter(e =>
        (e.aerolinea?.nombre ?? '').toLowerCase().includes(txt) ||
        (e.aeropuertoOrigen?.codigoOaci ?? '').toLowerCase().includes(txt) ||
        (e.aeropuertoOrigen?.ciudad ?? '').toLowerCase().includes(txt) ||
        (e.aeropuertoDestino?.codigoOaci ?? '').toLowerCase().includes(txt) ||
        (e.aeropuertoDestino?.ciudad ?? '').toLowerCase().includes(txt) ||
        e.estado.toLowerCase().includes(txt)
      );
    }
    if (this.estadoFiltro) {
      lista = lista.filter(e => e.estado === this.estadoFiltro);
    }
    if (this.fechaRango?.length === 2 && this.fechaRango[0] && this.fechaRango[1]) {
      const desde = this.fechaRango[0].getTime();
      const hasta = this.fechaRango[1].getTime() + 86399999; // hasta fin del día
      lista = lista.filter(e => {
        const t = new Date(e.fechaRegistro).getTime();
        return t >= desde && t <= hasta;
      });
    }
    this.enviosFiltrados = lista;
    this.calcularEstadisticas();
  }

  limpiarFiltros(): void {
    this.textoBusqueda   = '';
    this.estadoFiltro    = '';
    this.fechaRango      = [];
    this.enviosFiltrados = [...this.envios];
    this.calcularEstadisticas();
  }

  exportarCSV(): void {
    const headers = ['ID', 'Aerolinea', 'Origen OACI', 'Origen Ciudad',
                     'Destino OACI', 'Destino Ciudad', 'Cantidad', 'Estado',
                     'Prioridad', 'Fecha Registro', 'Fecha Limite'];
    const rows = this.enviosFiltrados.map(e => [
      e.idEnvio,
      `"${e.aerolinea?.nombre ?? ''}"`,
      e.aeropuertoOrigen?.codigoOaci ?? '',
      `"${e.aeropuertoOrigen?.ciudad ?? ''}"`,
      e.aeropuertoDestino?.codigoOaci ?? '',
      `"${e.aeropuertoDestino?.ciudad ?? ''}"`,
      e.cantidad, e.estado, e.prioridad, e.fechaRegistro, e.fechaLimiteEntrega
    ]);
    const csv  = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `reporte-envios-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportarPDF(): void {
    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) return;

    const fechaHoy = new Date().toLocaleString('es-PE');
    const rangoLabel = this.fechaRango?.length === 2 && this.fechaRango[0] && this.fechaRango[1]
      ? `${this.fechaRango[0].toLocaleDateString('es-PE')} — ${this.fechaRango[1].toLocaleDateString('es-PE')}`
      : 'Todas las fechas';

    const filas = this.enviosFiltrados.map(e => `
      <tr>
        <td>${e.idEnvio}</td>
        <td>${e.aeropuertoOrigen?.codigoOaci ?? ''}</td>
        <td>${e.aeropuertoDestino?.codigoOaci ?? ''}</td>
        <td>${e.aerolinea?.nombre ?? ''}</td>
        <td>${e.cantidad}</td>
        <td><span class="estado ${e.estado.toLowerCase().replace('_','-')}">${e.estado.replace('_',' ')}</span></td>
        <td>${e.prioridad}</td>
        <td>${new Date(e.fechaRegistro).toLocaleDateString('es-PE')}</td>
      </tr>`).join('');

    printWin.document.write(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Reporte de Envíos</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #0f172a; margin: 20px; }
  h1 { font-size: 18px; margin: 0 0 4px; color: #1d4ed8; }
  .meta { color: #64748b; font-size: 10px; margin-bottom: 14px; }
  .kpis { display: flex; gap: 16px; margin-bottom: 14px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 14px; min-width: 100px; }
  .kpi-val { font-size: 18px; font-weight: 700; color: #1d4ed8; }
  .kpi-lbl { font-size: 9px; color: #64748b; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e3a5f; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
  tr:nth-child(even) td { background: #f8fafc; }
  .estado { padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
  .registrada    { background: #dbeafe; color: #1d4ed8; }
  .en-transito   { background: #fef3c7; color: #b45309; }
  .entregada     { background: #dcfce7; color: #166534; }
  .retrasada     { background: #fee2e2; color: #b91c1c; }
  .en-espera     { background: #ede9fe; color: #6d28d9; }
  @media print { body { margin: 10px; } }
</style></head><body>
<h1>Reporte de Envíos de Maletas</h1>
<div class="meta">Generado: ${fechaHoy} &nbsp;|&nbsp; Rango: ${rangoLabel} &nbsp;|&nbsp; Total mostrados: ${this.enviosFiltrados.length}</div>
<div class="kpis">
  ${this.kpis.map(k => `<div class="kpi"><div class="kpi-val">${k.value}</div><div class="kpi-lbl">${k.label}</div></div>`).join('')}
</div>
<table>
  <thead><tr><th>ID</th><th>Origen</th><th>Destino</th><th>Aerolínea</th><th>Cant.</th><th>Estado</th><th>Prior.</th><th>Registro</th></tr></thead>
  <tbody>${filas}</tbody>
</table>
</body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); printWin.close(); }, 500);
  }

  getEstadoColor(estado: string): string {
    return this.ESTADO_COLORS[estado] ?? '#94a3b8';
  }

  getTotalMaletasFiltradas(): number {
    return this.enviosFiltrados.reduce((s, e) => s + e.cantidad, 0);
  }

  readonly ESTADOS_LISTA = [
    { label: 'Todos', value: '' },
    { label: 'Registrada',  value: 'REGISTRADA'  },
    { label: 'En Tránsito', value: 'EN_TRANSITO'  },
    { label: 'Entregada',   value: 'ENTREGADA'    },
    { label: 'Retrasada',   value: 'RETRASADA'    },
    { label: 'En Espera',   value: 'EN_ESPERA'    }
  ];
}
