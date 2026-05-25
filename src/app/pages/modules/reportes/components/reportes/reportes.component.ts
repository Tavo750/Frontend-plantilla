import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { MessageService } from 'primeng/api';
import { EnvioService, EnvioMaletas } from '../../../../../core/services/envio.service';

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
    this.envioService.listarEnvios().subscribe({
      next: resp => {
        this.envios = resp.data ?? [];
        this.enviosFiltrados = [...this.envios];
        this.calcularEstadisticas();
        this.cargando = false;
        this.cdr.detectChanges();
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

  onBuscar(event: Event): void {
    const txt = (event.target as HTMLInputElement).value.toLowerCase();
    this.enviosFiltrados = txt
      ? this.envios.filter(e =>
          (e.aerolinea?.nombre ?? '').toLowerCase().includes(txt) ||
          (e.aeropuertoOrigen?.codigoOaci ?? '').toLowerCase().includes(txt) ||
          (e.aeropuertoOrigen?.ciudad ?? '').toLowerCase().includes(txt) ||
          (e.aeropuertoDestino?.codigoOaci ?? '').toLowerCase().includes(txt) ||
          (e.aeropuertoDestino?.ciudad ?? '').toLowerCase().includes(txt) ||
          e.estado.toLowerCase().includes(txt)
        )
      : [...this.envios];
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
      e.cantidad,
      e.estado,
      e.prioridad,
      e.fechaRegistro,
      e.fechaLimiteEntrega
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `reporte-envios-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  getEstadoColor(estado: string): string {
    return this.ESTADO_COLORS[estado] ?? '#94a3b8';
  }

  getTotalMaletasFiltradas(): number {
    return this.enviosFiltrados.reduce((s, e) => s + e.cantidad, 0);
  }
}
