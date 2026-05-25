import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { EnvioService, EnvioMaletas } from '../../../../../core/services/envio.service';
import { AeropuertoService, Aeropuerto } from '../../../../../core/services/aeropuerto.service';

interface KpiCard {
  titulo: string;
  valor: number;
  icono: string;
  color: string;
  bgColor: string;
}

interface EstadoChart {
  estado: string;
  cantidad: number;
  pct: number;
  color: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: false,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {

  cargando = true;
  error = false;

  envios: EnvioMaletas[] = [];
  aeropuertos: Aeropuerto[] = [];

  kpis: KpiCard[] = [];
  estadoChart: EstadoChart[] = [];
  continenteChart: { continente: string; cantidad: number; pct: number }[] = [];
  recentEnvios: EnvioMaletas[] = [];

  readonly ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
    REGISTRADA:  { label: 'Registradas',  color: '#3b82f6' },
    EN_TRANSITO: { label: 'En Tránsito',  color: '#f59e0b' },
    ENTREGADA:   { label: 'Entregadas',   color: '#10b981' },
    RETRASADA:   { label: 'Retrasadas',   color: '#ef4444' },
    EN_ESPERA:   { label: 'En Espera',    color: '#8b5cf6' }
  };

  constructor(
    private readonly envioService: EnvioService,
    private readonly aeropuertoService: AeropuertoService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarDatos();
  }

  private cargarDatos(): void {
    this.cargando = true;
    let enviosCargados = false;
    let aeropuertosCargados = false;

    const verificar = () => {
      if (enviosCargados && aeropuertosCargados) {
        this.cargando = false;
        this.procesarDatos();
        this.cdr.detectChanges();
      }
    };

    this.envioService.listarEnvios().subscribe({
      next: resp => {
        this.envios = resp.data ?? [];
        enviosCargados = true;
        verificar();
      },
      error: () => {
        this.error = true;
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });

    this.aeropuertoService.listarAeropuertos().subscribe({
      next: resp => {
        this.aeropuertos = resp.data ?? [];
        aeropuertosCargados = true;
        verificar();
      },
      error: () => {
        aeropuertosCargados = true;
        verificar();
      }
    });
  }

  private procesarDatos(): void {
    const total = this.envios.length;
    const totalMaletas = this.envios.reduce((s, e) => s + e.cantidad, 0);

    // ── Estado counts ──────────────────────────────
    const estadoCounts: Record<string, number> = {};
    this.envios.forEach(e => {
      estadoCounts[e.estado] = (estadoCounts[e.estado] ?? 0) + 1;
    });

    const registradas  = estadoCounts['REGISTRADA']  ?? 0;
    const enTransito   = estadoCounts['EN_TRANSITO'] ?? 0;
    const entregadas   = estadoCounts['ENTREGADA']   ?? 0;
    const retrasadas   = estadoCounts['RETRASADA']   ?? 0;

    // ── KPIs ────────────────────────────────────────
    this.kpis = [
      { titulo: 'Total Envíos',    valor: total,       icono: 'pi pi-inbox',        color: '#2563eb', bgColor: '#eff6ff' },
      { titulo: 'En Tránsito',     valor: enTransito,  icono: 'pi pi-send',         color: '#d97706', bgColor: '#fffbeb' },
      { titulo: 'Entregadas',      valor: entregadas,  icono: 'pi pi-check-circle', color: '#16a34a', bgColor: '#f0fdf4' },
      { titulo: 'Retrasadas',      valor: retrasadas,  icono: 'pi pi-exclamation-triangle', color: '#dc2626', bgColor: '#fef2f2' },
      { titulo: 'Total Maletas',   valor: totalMaletas, icono: 'pi pi-box',         color: '#7c3aed', bgColor: '#f5f3ff' },
      { titulo: 'Aeropuertos',     valor: this.aeropuertos.length, icono: 'pi pi-map-marker', color: '#0891b2', bgColor: '#ecfeff' }
    ];

    // ── Chart de estados ────────────────────────────
    this.estadoChart = Object.entries(estadoCounts).map(([estado, cantidad]) => ({
      estado,
      cantidad,
      pct: total > 0 ? Math.round((cantidad / total) * 100) : 0,
      color: this.ESTADO_CONFIG[estado]?.color ?? '#94a3b8'
    }));

    // ── Chart por continente ────────────────────────
    const contCounts: Record<string, number> = {};
    this.aeropuertos.forEach(a => {
      contCounts[a.continente] = (contCounts[a.continente] ?? 0) + 1;
    });
    const totalAero = this.aeropuertos.length || 1;
    this.continenteChart = Object.entries(contCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([continente, cantidad]) => ({
        continente,
        cantidad,
        pct: Math.round((cantidad / totalAero) * 100)
      }));

    // ── Últimos 10 envíos ───────────────────────────
    this.recentEnvios = [...this.envios]
      .sort((a, b) => new Date(b.fechaRegistro).getTime() - new Date(a.fechaRegistro).getTime())
      .slice(0, 10);
  }

  getEstadoLabel(estado: string): string {
    return this.ESTADO_CONFIG[estado]?.label ?? estado;
  }

  getEstadoColor(estado: string): string {
    return this.ESTADO_CONFIG[estado]?.color ?? '#94a3b8';
  }

  recargar(): void {
    this.error = false;
    this.cargarDatos();
  }
}
