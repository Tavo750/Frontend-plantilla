import {
  Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone,
  ViewChild, ElementRef, HostListener
} from '@angular/core';
import { MessageService } from 'primeng/api';
import { SimulacionService, EventoSimulacion, ResumenSimulacion } from '../../../../../core/services/simulacion.service';
import { AeropuertoService } from '../../../../../core/services/aeropuerto.service';

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface AeropuertoPosicion {
  codigoOaci: string;
  ciudad: string;
  lat: number;
  lon: number;
  x: number;
  y: number;
  capacidad: number;
}

export interface VueloSimulacion {
  codigoVuelo: string;
  origen: string;
  destino: string;
  horaSalida: Date;
  horaLlegada: Date;
  totalMaletas: number;
  envios: { idEnvio: number; cantidad: number; cumpleSla?: boolean }[];
}

export interface ArcoVuelo {
  d: string;
  estado: 'PENDIENTE' | 'EN_VUELO' | 'ATERRIZADO';
  vuelo: VueloSimulacion;
}

export interface PlanoEnMapa {
  vuelo: VueloSimulacion;
  x: number;
  y: number;
  angulo: number;
  progreso: number;
}

interface EventoReciente {
  mensaje: string;
  hora: Date;
  tipo: 'despegue' | 'aterrizaje';
}

export interface ResumenAeropuertoItem {
  codigoOaci: string;
  asignados: number;
  noAsignados: number;
}

// ── Componente ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-simulacion',
  standalone: false,
  templateUrl: './simulacion.component.html',
  styleUrl: './simulacion.component.css'
})
export class SimulacionComponent implements OnInit, OnDestroy {

  // ── Formulario ─────────────────────────────────────────────
  fechaInicio: Date = new Date('2026-01-02');
  dias = 5;

  // ── Estado UI ──────────────────────────────────────────────
  estado: 'idle' | 'importando' | 'cargando' | 'streaming' | 'listo' = 'idle';
  mostrarConfig = true;
  vueloSeleccionado: VueloSimulacion | null = null;
  diasEsperados = 5;
  diasRecibidos = 0;
  mensajeProgreso = '';

  // ── Datos ──────────────────────────────────────────────────
  resumen: ResumenSimulacion | null = null;
  aeropuertos: AeropuertoPosicion[] = [];
  aeropuertoMap = new Map<string, AeropuertoPosicion>();
  vuelos: VueloSimulacion[] = [];
  vueloMap  = new Map<string, VueloSimulacion>();
  arcosVuelo: ArcoVuelo[] = [];
  planosEnMapa: PlanoEnMapa[] = [];
  maletasEnAeropuerto = new Map<string, number>();

  // ── Eventos recientes ──────────────────────────────────────
  eventosRecientes: EventoReciente[] = [];
  private estadosAnteriores = new Map<string, string>();

  // ── Búsqueda ───────────────────────────────────────────────
  busqueda = '';
  vuelosBuscados: VueloSimulacion[] = [];

  // ── Resumen por aeropuerto ──────────────────────────────────
  resumenesAeropuerto = new Map<string, ResumenAeropuertoItem>();
  busquedaAeropuerto = '';
  private primerosVuelosRecibidos = false;

  // ── Gestión de vuelos (cancelar / reactivar) ────────────────
  vuelosCancelados   = new Set<string>();
  vueloParaCancelar: VueloSimulacion | null = null;
  mostrarConfirmCancelar = false;
  busquedaGestion    = '';
  cancelando         = false;
  cancelacionExitosa = false;
  codigoVueloCancelado = '';

  // ── Tooltip flotante ───────────────────────────────────────
  tooltip: { visible: boolean; x: number; y: number; lines: string[] } = {
    visible: false, x: 0, y: 0, lines: []
  };

  // ── SVG: viewBox del world.svg (equirectangular Simplemaps) ─
  readonly SVG_W   = 2000;
  readonly SVG_H   = 857;
  readonly LAT_MAX = 84;
  readonly LAT_MIN = -70.3;

  // ── Control de tiempo ──────────────────────────────────────
  tiempoInicioMs = 0;
  tiempoFinMs    = 0;
  tiempoActualMs = 0;
  reproduciendo  = false;
  velocidad = 1;
  readonly VELOCIDADES = [1, 2, 5, 10, 20];

  /** Milisegundos entre ticks de animación */
  private readonly TICK_MS  = 80;
  private readonly HORA_MS  = 3_600_000;
  /** Horas de simulación que avanzan por tick a velocidad 1×  (0.25 = 15 min) osea 1 es 1 hora */
  private readonly AVANCE_H = 0.05;

  private intervalId: any = null;
  private eventSource: EventSource | null = null;

  @ViewChild('mapContainerEl') mapContainerEl!: ElementRef<HTMLDivElement>;

  constructor(
    private readonly simulacionService: SimulacionService,
    private readonly aeropuertoService: AeropuertoService,
    private readonly messageService: MessageService,
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone
  ) {}

  ngOnInit(): void  { this.cargarAeropuertos(); }
  ngOnDestroy(): void { this.detener(); this.cerrarSSE(); }

  @HostListener('window:resize') onResize(): void {}

  // ── CARGA DE AEROPUERTOS ────────────────────────────────────

  private cargarAeropuertos(): void {
    this.aeropuertoService.listarAeropuertos().subscribe({
      next: resp => {
        this.aeropuertos = [];
        this.aeropuertoMap.clear();
        (resp.data ?? []).forEach(a => {
          const lat = this.parseDMS(a.latitud);
          const lon = this.parseDMS(a.longitud);
          const pos: AeropuertoPosicion = {
            codigoOaci: a.codigoOaci, ciudad: a.ciudad,
            lat, lon,
            x: this.lonToX(lon),
            y: this.latToY(lat),
            capacidad: a.capacidad
          };
          this.aeropuertos.push(pos);
          this.aeropuertoMap.set(a.codigoOaci, pos);
        });
        this.cdr.detectChanges();
      }
    });
  }

  // ── SIMULACIÓN ─────────────────────────────────────────────

  ejecutarSimulacion(): void {
    // Resetear estado
    this.detener();
    this.cerrarSSE();
    this.vuelos = []; this.vueloMap.clear();
    this.arcosVuelo = []; this.planosEnMapa = [];
    this.maletasEnAeropuerto.clear();
    this.resumen = null; this.vueloSeleccionado = null;
    this.diasRecibidos = 0; this.diasEsperados = this.dias;
    this.tiempoInicioMs = 0; this.tiempoFinMs = 0; this.tiempoActualMs = 0;
    this.eventosRecientes = []; this.estadosAnteriores.clear();
    this.vuelosBuscados = []; this.busqueda = '';
    this.resumenesAeropuerto.clear();
    this.busquedaAeropuerto = '';
    this.primerosVuelosRecibidos = false;
    this.vuelosCancelados.clear();
    this.vueloParaCancelar = null;
    this.mostrarConfirmCancelar = false;
    this.cancelacionExitosa = false;
    this.codigoVueloCancelado = '';
    this.busquedaGestion = '';
    this.cancelando = false;

    // Paso 1: importar planes de vuelo para el periodo seleccionado
    this.estado = 'importando';
    this.mensajeProgreso = 'Importando planes de vuelo...';
    this.cdr.detectChanges();

    const fecha = this.formatFecha(this.fechaInicio);

    this.simulacionService.importarVuelos(fecha, this.dias).subscribe({
      next: (respVuelos) => {
        const vuelos = respVuelos.data?.vuelosGenerados ?? '?';
        this.mensajeProgreso = `${vuelos} vuelos generados. Importando envíos...`;
        this.cdr.detectChanges();

        // Paso 2: importar envíos de todos los aeropuertos
        this.simulacionService.importarTodosEnvios(fecha, this.dias).subscribe({
          next: (respEnvios) => {
            const total      = respEnvios.data?.aeropuertosProcesados ?? '?';
            const insertados = respEnvios.data?.totalEnviosInsertados ?? '?';
            this.mensajeProgreso =
              `${total} aeropuertos · ${insertados} envíos cargados. Iniciando simulación...`;
            this.cdr.detectChanges();
            // Paso 3: iniciar streaming SSE
            this.iniciarStreaming();
          },
          error: (err) => {
            this.estado = 'idle'; this.mensajeProgreso = '';
            this.cdr.detectChanges();
            const detalle = err.error?.message ?? err.message ?? 'No se pudo importar los envíos.';
            this.messageService.add({ severity: 'error', summary: 'Error al importar envíos', detail: detalle });
          }
        });
      },
      error: (err) => {
        this.estado = 'idle'; this.mensajeProgreso = '';
        this.cdr.detectChanges();
        const detalle = err.error?.message ?? err.message ?? 'No se pudo importar los planes de vuelo.';
        this.messageService.add({ severity: 'error', summary: 'Error al importar vuelos', detail: detalle });
      }
    });
  }

  private iniciarStreaming(): void {
    this.estado = 'cargando';
    const url = this.simulacionService.getStreamUrl(this.formatFecha(this.fechaInicio), this.dias);

    this.ngZone.runOutsideAngular(() => {
      this.eventSource = new EventSource(url);

      this.eventSource.addEventListener('inicio', () => {
        this.ngZone.run(() => {
          this.estado = 'streaming';
          this.mostrarConfig = false;
          this.mensajeProgreso = 'Iniciando simulación...';
          this.cdr.detectChanges();
        });
      });

      this.eventSource.addEventListener('dia', (e: MessageEvent) => {
        this.ngZone.run(() => {
          const data = JSON.parse(e.data);
          this.diasRecibidos++;
          this.mensajeProgreso = `Procesando día ${this.diasRecibidos} de ${this.diasEsperados}...`;
          this.procesarEventosDia(data);
          this.cdr.detectChanges();
        });
      });

      this.eventSource.addEventListener('fin', (e: MessageEvent) => {
        this.ngZone.run(() => {
          const data = JSON.parse(e.data);
          this.resumen = data.resumen as ResumenSimulacion;
          this.estado = 'listo';
          this.mensajeProgreso = '';
          this.detener(); // Detener reproducción de streaming
          if (this.vuelos.length > 0) {
            // Recalcular tiempos con todos los vuelos recibidos
            this.tiempoInicioMs = Math.min(...this.vuelos.map(v => v.horaSalida.getTime()));
            this.tiempoFinMs    = Math.max(...this.vuelos.map(v => v.horaLlegada.getTime()));
            this.tiempoActualMs = this.tiempoInicioMs; // Rebobinar al inicio para ver todo el recorrido
          }
          this.computarArcos();
          this.actualizarEstado();
          this.cdr.detectChanges();
          this.messageService.add({
            severity: 'success', summary: 'Simulación completa',
            detail: `${this.vuelos.length} vuelos · ${this.resumen?.enviosAsignados ?? 0} envíos asignados`
          });
          // Reproducir automáticamente desde el día 1
          this.iniciar();
        });
        this.cerrarSSE();
      });

      this.eventSource.addEventListener('error', (e: MessageEvent) => {
        this.ngZone.run(() => {
          let detalle = 'Verifica que el backend esté activo.';
          try { const d = JSON.parse(e.data); if (d.mensaje) detalle = d.mensaje; } catch {}
          this.estado = 'idle'; this.mensajeProgreso = '';
          this.cdr.detectChanges();
          this.messageService.add({ severity: 'error', summary: 'Error en simulación', detail: detalle });
        });
        this.cerrarSSE();
      });

      this.eventSource.onerror = () => {
        this.ngZone.run(() => {
          if (this.estado !== 'listo' && this.estado !== 'idle') {
            this.estado = 'idle'; this.mensajeProgreso = '';
            this.cdr.detectChanges();
            this.messageService.add({ severity: 'error', summary: 'Conexión interrumpida',
              detail: 'La conexión SSE se cerró inesperadamente.' });
          }
        });
        this.cerrarSSE();
      };
    });
  }

  detenerTodo(): void {
    this.detener(); this.cerrarSSE();
    this.estado = 'idle'; this.mostrarConfig = true;
    this.vuelos = []; this.vueloMap.clear();
    this.arcosVuelo = []; this.planosEnMapa = [];
    this.maletasEnAeropuerto.clear();
    this.resumen = null; this.vueloSeleccionado = null;
    this.eventosRecientes = []; this.estadosAnteriores.clear();
    this.vuelosCancelados.clear();
    this.vueloParaCancelar = null;
    this.mostrarConfirmCancelar = false;
    this.cancelacionExitosa = false;
    this.codigoVueloCancelado = '';
    this.busquedaGestion = '';
    this.cancelando = false;
    this.cdr.detectChanges();
  }

  private procesarEventosDia(data: { dia: number; fecha: string; eventos: EventoSimulacion[] }): void {
    (data.eventos ?? []).forEach(evento => {
      // ── Actualizar resumen por aeropuerto (todos los eventos) ──
      const keyAero = evento.origen;
      if (!this.resumenesAeropuerto.has(keyAero)) {
        this.resumenesAeropuerto.set(keyAero, { codigoOaci: keyAero, asignados: 0, noAsignados: 0 });
      }
      const stats = this.resumenesAeropuerto.get(keyAero)!;
      if (evento.estado === 'ASIGNADO') { stats.asignados++; } else { stats.noAsignados++; }

      // ── Construir rutas de vuelo (solo ASIGNADO con tramos) ──
      if (evento.estado !== 'ASIGNADO' || !evento.tramos?.length) return;
      evento.tramos.forEach(tramo => {
        const key = tramo.codigoVuelo;
        if (!this.vueloMap.has(key)) {
          const v: VueloSimulacion = {
            codigoVuelo: key,
            origen: tramo.origen, destino: tramo.destino,
            horaSalida:  new Date(tramo.horaSalida),
            horaLlegada: new Date(tramo.horaLlegada),
            totalMaletas: 0, envios: []
          };
          this.vueloMap.set(key, v);
          this.vuelos.push(v);
        }
        const v = this.vueloMap.get(key)!;
        v.totalMaletas += evento.cantidad;
        v.envios.push({ idEnvio: evento.idEnvio, cantidad: evento.cantidad, cumpleSla: evento.cumpleSla });
      });
    });

    // ── Auto-play: arrancar en el primer día con vuelos; extender fin en días sucesivos ──
    if (!this.primerosVuelosRecibidos && this.vuelos.length > 0) {
      this.primerosVuelosRecibidos = true;
      this.tiempoInicioMs = Math.min(...this.vuelos.map(v => v.horaSalida.getTime()));
      this.tiempoFinMs    = Math.max(...this.vuelos.map(v => v.horaLlegada.getTime()));
      this.tiempoActualMs = this.tiempoInicioMs;
      this.computarArcos();
      this.actualizarEstado();
      this.iniciarAutoPlayStreaming();
    } else if (this.primerosVuelosRecibidos && this.vuelos.length > 0) {
      const newFin = Math.max(...this.vuelos.map(v => v.horaLlegada.getTime()));
      if (newFin > this.tiempoFinMs) { this.tiempoFinMs = newFin; }
      this.computarArcos();
      this.actualizarEstado();
    }
  }

  private iniciarAutoPlayStreaming(): void {
    if (this.intervalId) return;
    this.reproduciendo = true;
    this.ngZone.runOutsideAngular(() => {
      this.intervalId = setInterval(() => {
        if (this.tiempoActualMs < this.tiempoFinMs) {
          this.tiempoActualMs += this.HORA_MS * this.AVANCE_H;
          if (this.tiempoActualMs > this.tiempoFinMs) { this.tiempoActualMs = this.tiempoFinMs; }
        }
        // No llama detener() — sigue avanzando mientras llegan más días vía SSE
        this.actualizarEstado();
        this.cdr.detectChanges();
      }, this.TICK_MS);
    });
  }

  private cerrarSSE(): void {
    if (this.eventSource) { this.eventSource.close(); this.eventSource = null; }
  }

  // ── CONTROL DE TIEMPO ──────────────────────────────────────

  togglePlay(): void { this.reproduciendo ? this.detener() : this.iniciar(); }

  iniciar(): void {
    if (this.tiempoActualMs >= this.tiempoFinMs) this.tiempoActualMs = this.tiempoInicioMs;
    this.reproduciendo = true;
    this.ngZone.runOutsideAngular(() => {
      this.intervalId = setInterval(() => {
        // Avanza AVANCE_H horas × velocidad por cada tick de TICK_MS ms
        this.tiempoActualMs += this.velocidad * this.HORA_MS * this.AVANCE_H;
        if (this.tiempoActualMs >= this.tiempoFinMs) {
          this.tiempoActualMs = this.tiempoFinMs;
          this.detener();
        }
        this.actualizarEstado();
        this.cdr.detectChanges();
      }, this.TICK_MS);
    });
  }

  detener(): void {
    this.reproduciendo = false;
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  onSliderChange(event: Event): void {
    this.tiempoActualMs = +(event.target as HTMLInputElement).value;
    this.actualizarEstado();
  }

  setVelocidad(v: number): void {
    this.velocidad = v;
    if (this.reproduciendo) { this.detener(); this.iniciar(); }
  }

  get tiempoLabel(): string {
    return new Date(this.tiempoActualMs).toLocaleString('es-PE', {
      weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  get diaActualLabel(): string {
    if (!this.tiempoInicioMs || !this.tiempoActualMs) return '';
    const diffMs      = this.tiempoActualMs - this.tiempoInicioMs;
    const diaCalc     = Math.floor(diffMs / (24 * this.HORA_MS)) + 1;
    // Durante streaming no adelantar el contador más allá de los días ya recibidos
    const diaMax      = this.estado === 'streaming' ? this.diasRecibidos : this.dias;
    const dia         = Math.min(diaCalc, diaMax);
    const hora        = new Date(this.tiempoActualMs).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    return `Día ${dia} · ${hora}`;
  }

  /** Arcos que se deben renderizar: solo vuelos actualmente en tránsito */
  get arcosVisibles(): ArcoVuelo[] {
    return this.arcosVuelo.filter(a => a.estado === 'EN_VUELO');
  }

  get progresoSlider(): number {
    if (this.tiempoFinMs === this.tiempoInicioMs) return 0;
    return Math.round(((this.tiempoActualMs - this.tiempoInicioMs) /
      (this.tiempoFinMs - this.tiempoInicioMs)) * 100);
  }

  // ── CÓMPUTOS ──────────────────────────────────────────────

  private computarTiempos(): void {
    if (!this.vuelos.length) return;
    this.tiempoInicioMs = Math.min(...this.vuelos.map(v => v.horaSalida.getTime()));
    this.tiempoFinMs    = Math.max(...this.vuelos.map(v => v.horaLlegada.getTime()));
    this.tiempoActualMs = this.tiempoInicioMs;
  }

  private computarArcos(): void {
    this.arcosVuelo = this.vuelos
      .map(v => {
        const o = this.aeropuertoMap.get(v.origen);
        const d = this.aeropuertoMap.get(v.destino);
        if (!o || !d) return null;
        const arco: ArcoVuelo = { d: this.calcArco(o.x, o.y, d.x, d.y), estado: 'PENDIENTE', vuelo: v };
        return arco;
      })
      .filter((x): x is ArcoVuelo => x !== null);
  }

  private actualizarEstado(): void {
    const now = this.tiempoActualMs;

    // ── Estado arcos + detección de eventos de transición ──
    this.arcosVuelo.forEach(arco => {
      const s = arco.vuelo.horaSalida.getTime();
      const l = arco.vuelo.horaLlegada.getTime();
      const nuevo: 'PENDIENTE' | 'EN_VUELO' | 'ATERRIZADO' =
        now >= l ? 'ATERRIZADO' : now >= s ? 'EN_VUELO' : 'PENDIENTE';
      const anterior = this.estadosAnteriores.get(arco.vuelo.codigoVuelo) ?? 'PENDIENTE';
      if (anterior !== nuevo) {
        if (nuevo === 'EN_VUELO')
          this.agregarEvento(
            `Vuelo ${arco.vuelo.codigoVuelo}: ${arco.vuelo.origen} → ${arco.vuelo.destino} despegó`, 'despegue');
        else if (nuevo === 'ATERRIZADO')
          this.agregarEvento(
            `Vuelo ${arco.vuelo.codigoVuelo}: aterrizó en ${arco.vuelo.destino}`, 'aterrizaje');
        this.estadosAnteriores.set(arco.vuelo.codigoVuelo, nuevo);
      }
      arco.estado = nuevo;
    });

    // ── Aviones en el aire ──
    this.planosEnMapa = this.vuelos
      .filter(v => now >= v.horaSalida.getTime() && now < v.horaLlegada.getTime())
      .map(v => {
        const t = (now - v.horaSalida.getTime()) / (v.horaLlegada.getTime() - v.horaSalida.getTime());
        const o = this.aeropuertoMap.get(v.origen);
        const d = this.aeropuertoMap.get(v.destino);
        if (!o || !d) return null;
        const cp  = this.ctrlPoint(o.x, o.y, d.x, d.y);
        const pos = this.bezierPt(t, o.x, o.y, cp.x, cp.y, d.x, d.y);
        const tan = this.bezierTan(t, o.x, o.y, cp.x, cp.y, d.x, d.y);
        return { vuelo: v, x: pos.x, y: pos.y,
          angulo: Math.atan2(tan.dy, tan.dx) * 180 / Math.PI + 90, progreso: t };
      })
      .filter((x): x is PlanoEnMapa => x !== null);

    // ── Maletas en aeropuerto (aún no han salido) ──
    this.maletasEnAeropuerto.clear();
    this.vuelos.forEach(v => {
      if (now < v.horaSalida.getTime()) {
        const cur = this.maletasEnAeropuerto.get(v.origen) ?? 0;
        this.maletasEnAeropuerto.set(v.origen, cur + v.totalMaletas);
      }
    });
  }

  private agregarEvento(mensaje: string, tipo: 'despegue' | 'aterrizaje'): void {
    this.eventosRecientes.unshift({ mensaje, hora: new Date(this.tiempoActualMs), tipo });
    if (this.eventosRecientes.length > 60) this.eventosRecientes.pop();
  }

  // ── PROYECCIÓN SVG ─────────────────────────────────────────
  // world.svg es equirectangular: lon -180→+180 = x 0→2000 | lat 84°N→-70.3°S = y 0→857

  lonToX(lon: number): number { return ((lon + 180) / 360) * this.SVG_W; }
  latToY(lat: number): number {
    return ((this.LAT_MAX - lat) / (this.LAT_MAX - this.LAT_MIN)) * this.SVG_H;
  }

  private ctrlPoint(x1: number, y1: number, x2: number, y2: number) {
    const mx = (x1+x2)/2, my = (y1+y2)/2;
    const dx = x2-x1,     dy = y2-y1;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const c = Math.min(len * 0.22, 120);
    return { x: mx + (-dy/len)*c, y: my + (dx/len)*c };
  }

  private calcArco(x1: number, y1: number, x2: number, y2: number): string {
    const cp = this.ctrlPoint(x1, y1, x2, y2);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cp.x.toFixed(1)} ${cp.y.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  private bezierPt(t: number, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) {
    const u = 1-t;
    return { x: u*u*x1 + 2*u*t*cx + t*t*x2, y: u*u*y1 + 2*u*t*cy + t*t*y2 };
  }

  private bezierTan(t: number, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) {
    const u = 1-t;
    return { dx: 2*u*(cx-x1) + 2*t*(x2-cx), dy: 2*u*(cy-y1) + 2*t*(y2-cy) };
  }

  // ── HELPERS ────────────────────────────────────────────────

  getEstadoVuelo(v: VueloSimulacion): 'PENDIENTE' | 'EN_VUELO' | 'ATERRIZADO' {
    const now = this.tiempoActualMs;
    if (now >= v.horaLlegada.getTime()) return 'ATERRIZADO';
    if (now >= v.horaSalida.getTime())  return 'EN_VUELO';
    return 'PENDIENTE';
  }

  getProgresoVuelo(v: VueloSimulacion): number {
    const now = this.tiempoActualMs;
    const s = v.horaSalida.getTime(), l = v.horaLlegada.getTime();
    return Math.max(0, Math.min(100, ((now-s)/(l-s))*100));
  }

  getBagsEnAeropuerto(codigo: string): number {
    return this.maletasEnAeropuerto.get(codigo) ?? 0;
  }

  getVuelosActivos():    number { return this.planosEnMapa.length; }
  getVuelosCompletados(): number {
    const now = this.tiempoActualMs;
    return this.vuelos.filter(v => v.horaLlegada.getTime() <= now).length;
  }
  getPaquetesTotales(): number { return this.vuelos.reduce((s,v) => s+v.totalMaletas, 0); }

  getMaletasEnVuelo(): number {
    return this.planosEnMapa.reduce((s,p) => s+p.vuelo.totalMaletas, 0);
  }
  getMaletasEntregadas(): number {
    const now = this.tiempoActualMs;
    return this.vuelos.filter(v => v.horaLlegada.getTime() <= now)
      .reduce((s,v) => s+v.totalMaletas, 0);
  }
  getMaletasRetrasadas(): number {
    const now = this.tiempoActualMs;
    return this.vuelos.filter(v => v.horaLlegada.getTime() <= now)
      .reduce((s,v) => s + v.envios.filter(e => e.cumpleSla === false).length, 0);
  }

  // ── SEMÁFORO (basado en cumpleSla) ─────────────────────────
  // Verde: 0% sin SLA | Ámbar: <50% sin SLA | Rojo: ≥50% sin SLA

  getVuelosAtiempo(): number {
    return this.planosEnMapa.filter(p => p.vuelo.envios.every(e => e.cumpleSla !== false)).length;
  }
  getVuelosRetrasadoLeve(): number {
    return this.planosEnMapa.filter(p => {
      const fails = p.vuelo.envios.filter(e => e.cumpleSla === false).length;
      const total = p.vuelo.envios.length;
      return fails > 0 && total > 0 && fails / total < 0.5;
    }).length;
  }
  getVuelosRetrasadoCritico(): number {
    return this.planosEnMapa.filter(p => {
      const fails = p.vuelo.envios.filter(e => e.cumpleSla === false).length;
      const total = p.vuelo.envios.length;
      return total > 0 && fails / total >= 0.5;
    }).length;
  }
  getVuelosAterrizando(): number {
    const now = this.tiempoActualMs;
    const ventana = 30 * 60 * 1000; // 30 min en ms de simulación
    return this.vuelos.filter(v => {
      const l = v.horaLlegada.getTime();
      return l <= now && l > now - ventana;
    }).length;
  }

  // ── BÚSQUEDA ───────────────────────────────────────────────

  onBuscar(event: Event): void {
    this.busqueda = (event.target as HTMLInputElement).value.toLowerCase().trim();
    if (!this.busqueda) { this.vuelosBuscados = []; return; }
    this.vuelosBuscados = this.vuelos.filter(v =>
      v.codigoVuelo.toLowerCase().includes(this.busqueda) ||
      v.origen.toLowerCase().includes(this.busqueda) ||
      v.destino.toLowerCase().includes(this.busqueda) ||
      v.envios.some(e => String(e.idEnvio).includes(this.busqueda))
    ).slice(0, 8);
  }

  limpiarBusqueda(): void { this.busqueda = ''; this.vuelosBuscados = []; }

  // ── RESUMEN POR AEROPUERTO ─────────────────────────────────

  get resumenesAeropuertoFiltrados(): ResumenAeropuertoItem[] {
    const lista = Array.from(this.resumenesAeropuerto.values())
      .sort((a, b) => (b.asignados + b.noAsignados) - (a.asignados + a.noAsignados));
    if (!this.busquedaAeropuerto) return lista;
    return lista.filter(r => r.codigoOaci.toUpperCase().includes(this.busquedaAeropuerto));
  }

  onBuscarAeropuerto(event: Event): void {
    this.busquedaAeropuerto = (event.target as HTMLInputElement).value.toUpperCase().trim();
  }

  limpiarBusquedaAeropuerto(): void { this.busquedaAeropuerto = ''; }

  // ── GESTIÓN DE VUELOS ──────────────────────────────────────

  get vuelosGestionFiltrados(): VueloSimulacion[] {
    const q = this.busquedaGestion.toUpperCase().trim();
    const lista = this.vuelos.slice().sort((a, b) =>
      (a.codigoVuelo ?? '').localeCompare(b.codigoVuelo ?? ''));
    if (!q) return lista;
    return lista.filter(v =>
      (v.codigoVuelo ?? '').toUpperCase().includes(q) ||
      (v.origen ?? '').toUpperCase().includes(q) ||
      (v.destino ?? '').toUpperCase().includes(q)
    );
  }

  onBuscarGestion(event: Event): void {
    this.busquedaGestion = (event.target as HTMLInputElement).value;
  }

  limpiarBusquedaGestion(): void { this.busquedaGestion = ''; }

  pedirCancelarVuelo(v: VueloSimulacion): void {
    this.vueloParaCancelar = v;
    this.mostrarConfirmCancelar = true;
  }

  confirmarCancelar(): void {
    if (!this.vueloParaCancelar) return;
    const codigo = this.vueloParaCancelar.codigoVuelo;
    this.cancelando = true;
    this.simulacionService.cancelarVuelo(codigo).subscribe({
      next: () => {
        this.vuelosCancelados.add(codigo);
        this.codigoVueloCancelado = codigo;
        this.cancelando = false;
        this.cancelacionExitosa = true; // Cambiar a fase 2: ofrecer reprogramar
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cancelando = false;
        const detalle = err.error?.message ?? 'No se pudo cancelar el vuelo.';
        this.messageService.add({ severity: 'error', summary: 'Error al cancelar', detail: detalle });
        this.cdr.detectChanges();
      }
    });
  }

  cerrarDialogoCancelacion(): void {
    this.mostrarConfirmCancelar = false;
    this.cancelacionExitosa = false;
    this.vueloParaCancelar = null;
    this.codigoVueloCancelado = '';
  }

  reprogramarEnvios(): void {
    const codigo = this.codigoVueloCancelado;
    this.cerrarDialogoCancelacion();

    // Resetear estado de animación sin re-importar datos de BD.
    // El ALNS usará los vuelos ya guardados, con el cancelado marcado como CANCELADO.
    this.detener();
    this.cerrarSSE();
    this.vuelos = []; this.vueloMap.clear();
    this.arcosVuelo = []; this.planosEnMapa = [];
    this.maletasEnAeropuerto.clear();
    this.resumen = null; this.vueloSeleccionado = null;
    this.diasRecibidos = 0; this.diasEsperados = this.dias;
    this.tiempoInicioMs = 0; this.tiempoFinMs = 0; this.tiempoActualMs = 0;
    this.eventosRecientes = []; this.estadosAnteriores.clear();
    this.vuelosBuscados = []; this.busqueda = '';
    this.resumenesAeropuerto.clear();
    this.busquedaAeropuerto = '';
    this.primerosVuelosRecibidos = false;
    this.vuelosCancelados.clear();
    this.busquedaGestion = '';
    this.cancelando = false;

    // Saltar importación y ejecutar directamente el streaming SSE
    this.mostrarConfig = false;
    this.mensajeProgreso = `Re-enrutando envíos (vuelo ${codigo} excluido)...`;
    this.cdr.detectChanges();
    this.iniciarStreaming();
  }

  reactivarVuelo(v: VueloSimulacion): void {
    this.simulacionService.reactivarVuelo(v.codigoVuelo).subscribe({
      next: () => {
        this.vuelosCancelados.delete(v.codigoVuelo);
        this.messageService.add({
          severity: 'success', summary: 'Vuelo reactivado',
          detail: `${v.codigoVuelo} vuelto a PROGRAMADO.`
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        const detalle = err.error?.message ?? 'No se pudo reactivar el vuelo.';
        this.messageService.add({ severity: 'error', summary: 'Error al reactivar', detail: detalle });
        this.cdr.detectChanges();
      }
    });
  }

  seleccionarVuelo(v: VueloSimulacion): void {
    this.vueloSeleccionado = this.vueloSeleccionado?.codigoVuelo === v.codigoVuelo ? null : v;
  }

  // ── TOOLTIP ────────────────────────────────────────────────

  onAirportHover(event: MouseEvent, a: AeropuertoPosicion): void {
    const bags = this.getBagsEnAeropuerto(a.codigoOaci);
    const pct  = a.capacidad > 0 ? Math.round(bags / a.capacidad * 100) : 0;
    const sem  = pct >= 85 ? '🔴 Almacén crítico (>85%)'
               : pct >= 60 ? '🟡 Capacidad media (>60%)'
               : '🟢 Espacio disponible';
    const rect = this.mapContainerEl?.nativeElement?.getBoundingClientRect();
    const relX = rect ? event.clientX - rect.left : event.offsetX;
    const relY = rect ? event.clientY - rect.top  : event.offsetY;
    const flip = rect ? relX > rect.width - 250 : false;
    this.tooltip = {
      visible: true,
      x: flip ? relX - 250 : relX + 14,
      y: relY + 14,
      lines: [
        `${a.codigoOaci} – ${a.ciudad}`,
        `Capacidad total: ${a.capacidad} maletas`,
        `En almacén: ${bags} maletas (${pct}%)`,
        sem
      ]
    };
  }

  onPlaneHover(event: MouseEvent, p: PlanoEnMapa): void {
    const rect  = this.mapContainerEl?.nativeElement?.getBoundingClientRect();
    const relX  = rect ? event.clientX - rect.left : event.offsetX;
    const relY  = rect ? event.clientY - rect.top  : event.offsetY;
    const flip  = rect ? relX > rect.width - 250 : false;
    const fails = p.vuelo.envios.filter(e => e.cumpleSla === false).length;
    const slaLbl = fails === 0 ? '✅ Todos cumplen SLA' : `⚠️ ${fails} envío(s) sin SLA`;
    const envLines = p.vuelo.envios.slice(0, 5).map(e =>
      `  #${e.idEnvio}: ${e.cantidad} maletas${e.cumpleSla === false ? ' ⚠' : ''}`
    );
    const extra = p.vuelo.envios.length > 5 ? [`  ...y ${p.vuelo.envios.length-5} más`] : [];
    this.tooltip = {
      visible: true,
      x: flip ? relX - 250 : relX + 14,
      y: relY + 14,
      lines: [
        `✈ Vuelo ${p.vuelo.codigoVuelo}`,
        `${p.vuelo.origen} → ${p.vuelo.destino}`,
        `Total: ${p.vuelo.totalMaletas} maletas · ${p.vuelo.envios.length} envíos`,
        slaLbl,
        ...envLines,
        ...extra
      ]
    };
  }

  onHoverEnd(): void { this.tooltip.visible = false; }

  // ── TRACK ──────────────────────────────────────────────────

  trackPlano(_: number, p: PlanoEnMapa): string   { return p.vuelo.codigoVuelo; }
  trackAero (_: number, a: AeropuertoPosicion): string { return a.codigoOaci; }
  trackArco (_: number, a: ArcoVuelo): string     { return a.vuelo.codigoVuelo; }

  get progresoStreaming(): number {
    return this.diasEsperados > 0
      ? Math.round((this.diasRecibidos / this.diasEsperados) * 100)
      : 0;
  }

  // ── PARSERS ────────────────────────────────────────────────
  // Regex permisiva (igual a mapa.component.ts) + fallback a decimal puro

  parseDMS(dms: string): number {
    if (!dms) return 0;
    const match = dms.match(/(\d+)\D+(\d+)\D+([\d.]+)\D*([NSEWnsew])/);
    if (!match) return parseFloat(dms) || 0;
    const [, deg, min, sec, dir] = match;
    let decimal = +deg + +min / 60 + +sec / 3600;
    if (dir.toUpperCase() === 'S' || dir.toUpperCase() === 'W') decimal = -decimal;
    return decimal;
  }

  private formatFecha(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
}
