import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef,
  HostListener, ChangeDetectorRef, NgZone
} from '@angular/core';
import { Subscription } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AeropuertoService, Aeropuerto } from '../../../../../core/services/aeropuerto.service';
import { SimulacionPeriodoService } from '../../services/simulacion-periodo.service';
import { ParametroSemaforoService, ParametroSemaforo } from '../../../../../core/services/parametro-semaforo.service';

// ── Tipos base ───────────────────────────────────────────────────────────────

type SemaforoNivel = 'VACIO' | 'VERDE' | 'AMARILLO' | 'ROJO';

interface AeropuertoMapa extends Aeropuerto {
  x: number;
  y: number;
  storagePct: number;
}

interface VueloAnimacion {
  codigoVuelo:   string;
  origen:        string;
  destino:       string;
  horaSalidaMs:  number;
  horaLlegadaMs: number;
  totalMaletas:  number;
}

interface PlanoEnMapa {
  vuelo:  VueloAnimacion;
  x:      number;
  y:      number;
  angulo: number;
}

interface ArcoVuelo {
  d:        string;
  vuelo:    VueloAnimacion;
  esRuta?:  boolean;
}

// ── Interfaces del panel ─────────────────────────────────────────────────────

interface VueloPanel {
  codigoVuelo:    string;
  origen:         string;
  destino:        string;
  horaSalida:     string;
  horaLlegada:    string;
  totalMaletas:   number;
  capacidadMaxima:number;
  ocupacionPct:   number;
  semaforo:       SemaforoNivel;
}

interface AlmacenPanel {
  codigo:       string;
  ciudad:       string;
  continente:   string;
  capacidad:    number;
  ocupacion:    number;
  pct:          number;
  semaforo:     SemaforoNivel;
  enviosSalen:  number;
  enviosEntran: number;
}

interface EnvioPanel {
  id:       string;
  origen:   string;
  destino:  string;
  cantidad: number;
  prioridad:number;
  vuelos:   string[];
}

interface IndicadoresGlobales {
  pctFlota:          number;
  semaforoFlota:     SemaforoNivel;
  pctAlmacenes:      number;
  semaforoAlmacenes: SemaforoNivel;
}

type EstadoMonitoreo = 'cargando' | 'procesando' | 'animando' | 'agotado';
type TabPanel = 'almacenes' | 'vuelos' | 'envios';

// ── Componente ───────────────────────────────────────────────────────────────

@Component({
  selector:    'app-mapa',
  standalone:  false,
  templateUrl: './mapa.component.html',
  styleUrl:    './mapa.component.css'
})
export class MapaComponent implements OnInit, OnDestroy {

  // ── Aeropuertos ──────────────────────────────────────────────
  aeropuertos:          Aeropuerto[]      = [];
  aeropuertosFiltrados: AeropuertoMapa[]  = [];
  private aeropuertosMapa: AeropuertoMapa[] = [];
  aeropuertoSvgMap = new Map<string, { x: number; y: number }>();
  private maxCapacidad = 1;
  continenteSeleccionado: string | null = null;
  continentes: string[] = [];

  // ── ViewChild ────────────────────────────────────────────────
  @ViewChild('mapContainerEl') mapContainerEl!: ElementRef<HTMLDivElement>;
  @ViewChild('panelListEl') panelListEl?: ElementRef<HTMLDivElement>;
  private renderBounds = { left: 0, top: 0, imgW: 0, imgH: 0, cw: 0, ch: 0 };

  // ── Constantes SVG (equirectangular Simplemaps) ──────────────
  readonly SVG_W   = 2000;
  readonly SVG_H   = 857;
  readonly LAT_MAX = 84;
  readonly LAT_MIN = -70.3;
  readonly LNG_MIN = -180;
  readonly LNG_MAX = 180;
  readonly worldMapUrl = '/world.svg';

  // ── Parámetros de planificación ──────────────────────────────
  K  = 60;
  Sa = 5;

  // ── Estado del monitoreo ─────────────────────────────────────
  estadoMonitoreo: EstadoMonitoreo = 'cargando';
  ventanaActualInicio: Date | null = null;
  numeroCiclo = 0;
  procesandoEnBackground = false;

  // ── Carga inicial ─────────────────────────────────────────────
  private cargasCompletas = 0;
  error = false;

  // ── WebSocket ─────────────────────────────────────────────────
  private wsSub: Subscription | null = null;

  // ── Reloj simulado autoritativo (backend) ───────────────────
  // El backend emite relojSim; el front lo extrapola para animar suave.
  private relojBaseMs = 0;   // tiempo simulado del backend al recibirlo (ms)
  private relojRecvMs = 0;   // marca real (Date.now) al recibirlo
  private kFactor = 90;      // ms simulados por ms real

  // ── Animación de vuelos ──────────────────────────────────────
  vuelosAnimacion: VueloAnimacion[] = [];
  planosEnMapa:    PlanoEnMapa[]    = [];
  arcosVuelo:      ArcoVuelo[]      = [];
  rutaArcos:       ArcoVuelo[]      = [];
  simTimeMs = 0;
  private animInterval: any = null;
  private readonly TICK_MS = 80;

  // ── Estadísticas acumuladas ──────────────────────────────────
  statsPedidosAsignados   = 0;   // nº de PEDIDOS asignados
  statsPedidosNoAsignados = 0;   // nº de PEDIDOS no asignados
  statsMaletasFisicas     = 0;   // suma de maletas físicas asignadas

  // ── Zoom / Pan ───────────────────────────────────────────────
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  private isDragging    = false;
  private dragStartX    = 0;
  private dragStartY    = 0;

  // ── Fullscreen ───────────────────────────────────────────────
  isFullscreen = false;

  // ── Tooltip de vuelo (hover sobre avión) ────────────────────
  tooltip: { visible: boolean; x: number; y: number; lines: string[] } =
    { visible: false, x: 0, y: 0, lines: [] };

  // ════════════════════════════════════════════════════════
  // PANEL LATERAL
  // ════════════════════════════════════════════════════════

  activeTab: TabPanel = 'almacenes';
  panelCollapsed = false;

  // Datos crudos del backend
  private panelVuelosRaw:    VueloPanel[]    = [];
  private panelAlmacenesRaw: AlmacenPanel[]  = [];
  private panelEnviosRaw:    EnvioPanel[]    = [];

  // Datos filtrados/ordenados para mostrar
  panelVuelos:    VueloPanel[]   = [];
  panelAlmacenes: AlmacenPanel[] = [];
  panelEnvios:    EnvioPanel[]   = [];

  // Indicadores globales
  indicadoresGlobales: IndicadoresGlobales | null = null;

  // Filtros UT
  filtroVueloCodigo = '';
  filtroVueloOrigen = '';
  filtroVueloDestino = '';
  sortVuelo: 'ocupacion' | 'salida' | 'llegada' | 'origen' | 'destino' | '' = '';

  // Filtros almacenes
  filtroAlmacenCodigo = '';
  filtroAlmacenContinente = '';
  sortAlmacen: 'ocupacion' | 'salen' | 'entran' | '' = '';

  // Filtros envíos
  filtroEnvioOrigen  = '';
  filtroEnvioDestino = '';

  // Filtro semáforo (global, aplica al tab activo)
  semaforoMapFiltro: SemaforoNivel | null = null;

  // Selección y vinculación
  selectedAeropuertoCod: string | null = null;
  selectedVueloCod:      string | null = null;
  selectedEnvioId:       string | null = null;

  // Lista de continentes únicos del panel
  continentesPanel: string[] = [];

  // ── Config semáforo ──────────────────────────────────────────
  mostrarConfigSemaforo = false;
  parametrosSemaforo: ParametroSemaforo[] = [];
  parametroEditando: ParametroSemaforo | null = null;
  guardandoParametro = false;

  constructor(
    private readonly aeropuertoService:         AeropuertoService,
    private readonly simulacionPeriodoService:   SimulacionPeriodoService,
    private readonly parametroSemaforoService:   ParametroSemaforoService,
    private readonly messageService:             MessageService,
    private readonly cdr:                        ChangeDetectorRef,
    private readonly ngZone:                     NgZone
  ) {}

  ngOnInit(): void {
    this.simulacionPeriodoService.getConfigMonitoreo().subscribe({
      next: (resp: any) => {
        const d = resp.data ?? {};
        this.K  = d['K']  ?? 90;
        this.Sa = d['SA'] ?? d['Sa'] ?? 5;
        this.kFactor = this.K;
        this.onCargaCompleta();
      },
      error: () => { this.onCargaCompleta(); }
    });
    this.cargarAeropuertos();
  }

  // ── Configuración de semáforo ────────────────────────────────

  abrirConfigSemaforo(): void {
    this.mostrarConfigSemaforo = true;
    this.parametroSemaforoService.listar().subscribe({
      next: resp => {
        this.parametrosSemaforo = resp.data ?? [];
        if (this.parametrosSemaforo.length === 0) {
          this.parametrosSemaforo = [{
            idParametro: null, entidad: 'MONITOREO',
            umbralAmbar: 50, umbralRojo: 80, activo: true
          }];
        }
        this.parametroEditando = { ...this.parametrosSemaforo[0] };
        this.cdr.detectChanges();
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar configuración.' })
    });
  }

  guardarParametroSemaforo(): void {
    if (!this.parametroEditando) return;
    this.guardandoParametro = true;
    const obs = this.parametroEditando.idParametro
      ? this.parametroSemaforoService.actualizar(this.parametroEditando.idParametro, this.parametroEditando)
      : this.parametroSemaforoService.crear(this.parametroEditando);

    obs.subscribe({
      next: resp => {
        this.guardandoParametro = false;
        this.mostrarConfigSemaforo = false;
        this.messageService.add({ severity: 'success', summary: 'Guardado', detail: 'Umbrales de semáforo actualizados.' });
        this.cdr.detectChanges();
      },
      error: () => {
        this.guardandoParametro = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar.' });
        this.cdr.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.limpiarAnimacion();
    // No desconectamos el WS ni detenemos el reloj: el servicio es singleton y la
    // simulación sigue corriendo server-side. Al volver al módulo se retoma el estado.
  }

  @HostListener('window:resize')
  onResize(): void { this.medirYEnriquecer(); }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.isFullscreen = !!document.fullscreenElement;
    if (!this.isFullscreen) { this.zoomLevel = 1; this.panX = 0; this.panY = 0; }
    setTimeout(() => { this.medirYEnriquecer(); this.cdr.detectChanges(); }, 100);
  }

  onMapLoaded(): void { this.medirYEnriquecer(); }

  // ── INICIO AUTOMÁTICO ────────────────────────────────────────

  private onCargaCompleta(): void {
    this.cargasCompletas++;
    if (this.cargasCompletas < 2) return;
    this.arrancarMonitoreo();
  }

  private arrancarMonitoreo(): void {
    const svc = this.simulacionPeriodoService;

    // 1. Bootstrap instantáneo desde el último estado cacheado (al volver al módulo)
    if (svc.estadoCacheado) {
      this.aplicarSnapshot(svc.estadoCacheado);
    } else {
      this.estadoMonitoreo = 'procesando';
    }

    // 2. Conectar WS para recibir reloj + planes en vivo
    this.iniciarWs();

    // 3. Arrancar la simulación server-side una sola vez; siempre traer snapshot fresco
    if (!svc.arrancado) {
      svc.marcarArrancado();
      svc.iniciarMonitoreo().subscribe({
        next: (resp: any) => { if (resp?.data) this.aplicarSnapshot(resp.data); },
        error: () => {}
      });
      // Red de seguridad: si el WS conectó después del primer PLAN, recuperar el snapshot
      setTimeout(() => svc.getEstado().subscribe({
        next: (resp: any) => { if (resp?.data?.vuelos?.length) this.aplicarSnapshot(resp.data); },
        error: () => {}
      }), 4000);
    } else {
      svc.getEstado().subscribe({
        next: (resp: any) => { if (resp?.data) this.aplicarSnapshot(resp.data); },
        error: () => {}
      });
    }

    this.cdr.detectChanges();
  }

  // ── WEBSOCKET ─────────────────────────────────────────────────

  private iniciarWs(): void {
    if (this.wsSub) return;
    this.simulacionPeriodoService.conectarWs();
    this.wsSub = this.simulacionPeriodoService.estadoWs$.subscribe(
      (est: any) => this.ngZone.run(() => this.procesarEstadoBackend(est))
    );
  }

  /**
   * Procesa mensajes del backend:
   *  - TICK → solo reloj + contadores (animación sigue suave con extrapolación)
   *  - PLAN / SNAPSHOT → además reemplaza vuelos y paneles
   */
  private procesarEstadoBackend(est: any): void {
    if (!est) return;
    const tipo: string = est['tipo'] ?? '';

    this.sincronizarReloj(est);
    this.actualizarContadores(est);

    if (tipo === 'PLAN' || tipo === 'SNAPSHOT') {
      this.aplicarVuelos(est);
      this.actualizarPanelDesdeResultado(est);
    }

    this.cdr.detectChanges();
  }

  /** Aplica un snapshot completo (bootstrap por HTTP o mensaje PLAN/SNAPSHOT). */
  private aplicarSnapshot(est: any): void {
    if (!est) return;
    this.sincronizarReloj(est);
    this.actualizarContadores(est);
    this.aplicarVuelos(est);
    this.actualizarPanelDesdeResultado(est);
    this.cdr.detectChanges();
  }

  /** Sincroniza el reloj simulado autoritativo del backend para extrapolar la animación. */
  private sincronizarReloj(est: any): void {
    if (est['K']) { this.K = est['K']; this.kFactor = est['K']; }
    if (est['SA']) { this.Sa = est['SA']; }
    if (est['ciclo'] != null) { this.numeroCiclo = est['ciclo']; }

    if (est['relojSim']) {
      this.relojBaseMs = new Date(est['relojSim']).getTime();
      this.relojRecvMs = Date.now();
      this.ventanaActualInicio = new Date(est['relojSim']);
    }

    if (this.estadoMonitoreo === 'cargando') this.estadoMonitoreo = 'procesando';
    this.iniciarAnimacion();
  }

  private actualizarContadores(est: any): void {
    if (est['pedidosAsignados']   != null) this.statsPedidosAsignados   = est['pedidosAsignados'];
    if (est['pedidosNoAsignados'] != null) this.statsPedidosNoAsignados = est['pedidosNoAsignados'];
    if (est['maletasFisicas']     != null) this.statsMaletasFisicas     = est['maletasFisicas'];
  }

  /** Reemplaza el set de vuelos animados con la lista acumulada del backend. */
  private aplicarVuelos(est: any): void {
    const vuelosRaw: any[] = est['vuelos'] ?? [];
    this.vuelosAnimacion = vuelosRaw.map((v: any) => ({
      codigoVuelo:   v['codigoVuelo'],
      origen:        v['origen'],
      destino:       v['destino'],
      horaSalidaMs:  new Date(v['horaSalida']).getTime(),
      horaLlegadaMs: new Date(v['horaLlegada']).getTime(),
      totalMaletas:  v['totalMaletas'] ?? 0
    }));
    this.estadoMonitoreo = this.vuelosAnimacion.length > 0 ? 'animando' : 'procesando';
  }

  // ── PANEL: extracción de datos del resultado ──────────────────

  private actualizarPanelDesdeResultado(data: any): void {
    // Vuelos (UT)
    const vuelosRaw: any[] = data['vuelos'] ?? [];
    this.panelVuelosRaw = vuelosRaw.map((v: any) => ({
      codigoVuelo:     v['codigoVuelo'],
      origen:          v['origen'],
      destino:         v['destino'],
      horaSalida:      v['horaSalida'] ?? '',
      horaLlegada:     v['horaLlegada'] ?? '',
      totalMaletas:    v['totalMaletas']    ?? 0,
      capacidadMaxima: v['capacidadMaxima'] ?? 300,
      ocupacionPct:    v['ocupacionPct']    ?? 0,
      semaforo:        (v['semaforo'] as SemaforoNivel) ?? 'VACIO'
    }));

    // Almacenes
    const almRaw: any[] = data['almacenesDetalle'] ?? [];
    this.panelAlmacenesRaw = almRaw.map((a: any) => ({
      codigo:       a['codigo'],
      ciudad:       a['ciudad']      ?? '',
      continente:   a['continente']  ?? '',
      capacidad:    a['capacidad']   ?? 0,
      ocupacion:    a['ocupacion']   ?? 0,
      pct:          a['pct']         ?? 0,
      semaforo:     (a['semaforo'] as SemaforoNivel) ?? 'VACIO',
      enviosSalen:  a['enviosSalen'] ?? 0,
      enviosEntran: a['enviosEntran'] ?? 0
    }));

    // Continentes únicos para el selector
    this.continentesPanel = [...new Set(this.panelAlmacenesRaw.map(a => a.continente))].sort();

    // Envíos
    const envRaw: any[] = data['enviosDetalle'] ?? [];
    this.panelEnviosRaw = envRaw.map((e: any) => ({
      id:       e['id'],
      origen:   e['origen']   ?? '',
      destino:  e['destino']  ?? '',
      cantidad: e['cantidad'] ?? 0,
      prioridad:e['prioridad'] ?? 3,
      vuelos:   e['vuelos']   ?? []
    }));

    // Indicadores globales
    const indRaw = data['indicadoresGlobales'];
    if (indRaw) {
      this.indicadoresGlobales = {
        pctFlota:          indRaw['pctFlota']          ?? 0,
        semaforoFlota:     (indRaw['semaforoFlota']     as SemaforoNivel) ?? 'VACIO',
        pctAlmacenes:      indRaw['pctAlmacenes']      ?? 0,
        semaforoAlmacenes: (indRaw['semaforoAlmacenes'] as SemaforoNivel) ?? 'VACIO'
      };
    }

    // Aplicar filtros con los nuevos datos
    this.aplicarFiltrosVuelos();
    this.aplicarFiltrosAlmacenes();
    this.aplicarFiltrosEnvios();
  }

  // ── PANEL: filtros y ordenamiento ────────────────────────────

  aplicarFiltrosVuelos(): void {
    let lista = [...this.panelVuelosRaw];

    if (this.filtroVueloCodigo) {
      const q = this.filtroVueloCodigo.toLowerCase();
      lista = lista.filter(v => v.codigoVuelo.toLowerCase().includes(q));
    }
    if (this.filtroVueloOrigen) {
      const q = this.filtroVueloOrigen.toLowerCase();
      lista = lista.filter(v => v.origen.toLowerCase().includes(q));
    }
    if (this.filtroVueloDestino) {
      const q = this.filtroVueloDestino.toLowerCase();
      lista = lista.filter(v => v.destino.toLowerCase().includes(q));
    }
    if (this.semaforoMapFiltro) {
      lista = lista.filter(v => v.semaforo === this.semaforoMapFiltro);
    }

    switch (this.sortVuelo) {
      case 'ocupacion': lista.sort((a, b) => b.ocupacionPct - a.ocupacionPct); break;
      case 'salida':    lista.sort((a, b) => a.horaSalida.localeCompare(b.horaSalida)); break;
      case 'llegada':   lista.sort((a, b) => a.horaLlegada.localeCompare(b.horaLlegada)); break;
      case 'origen':    lista.sort((a, b) => a.origen.localeCompare(b.origen)); break;
      case 'destino':   lista.sort((a, b) => a.destino.localeCompare(b.destino)); break;
    }

    this.panelVuelos = lista;
  }

  aplicarFiltrosAlmacenes(): void {
    let lista = [...this.panelAlmacenesRaw];

    if (this.filtroAlmacenCodigo) {
      const q = this.filtroAlmacenCodigo.toLowerCase();
      lista = lista.filter(a =>
        a.codigo.toLowerCase().includes(q) ||
        a.ciudad.toLowerCase().includes(q)
      );
    }
    if (this.filtroAlmacenContinente) {
      lista = lista.filter(a => a.continente === this.filtroAlmacenContinente);
    }
    if (this.semaforoMapFiltro) {
      lista = lista.filter(a => a.semaforo === this.semaforoMapFiltro);
    }

    switch (this.sortAlmacen) {
      case 'ocupacion': lista.sort((a, b) => b.pct - a.pct); break;
      case 'salen':     lista.sort((a, b) => b.enviosSalen - a.enviosSalen); break;
      case 'entran':    lista.sort((a, b) => b.enviosEntran - a.enviosEntran); break;
    }

    this.panelAlmacenes = lista;
  }

  aplicarFiltrosEnvios(): void {
    let lista = [...this.panelEnviosRaw];

    if (this.filtroEnvioOrigen) {
      const q = this.filtroEnvioOrigen.toLowerCase();
      lista = lista.filter(e => e.origen.toLowerCase().includes(q));
    }
    if (this.filtroEnvioDestino) {
      const q = this.filtroEnvioDestino.toLowerCase();
      lista = lista.filter(e => e.destino.toLowerCase().includes(q));
    }

    this.panelEnvios = lista;
  }

  setSortVuelo(campo: typeof this.sortVuelo): void {
    this.sortVuelo = this.sortVuelo === campo ? '' : campo;
    this.aplicarFiltrosVuelos();
  }

  setSortAlmacen(campo: typeof this.sortAlmacen): void {
    this.sortAlmacen = this.sortAlmacen === campo ? '' : campo;
    this.aplicarFiltrosAlmacenes();
  }

  filtrarPorSemaforo(nivel: SemaforoNivel | null): void {
    this.semaforoMapFiltro = this.semaforoMapFiltro === nivel ? null : nivel;
    this.aplicarFiltrosVuelos();
    this.aplicarFiltrosAlmacenes();
  }

  limpiarFiltrosEnvios(): void {
    this.filtroEnvioOrigen  = '';
    this.filtroEnvioDestino = '';
    this.aplicarFiltrosEnvios();
  }

  togglePanel(): void {
    this.panelCollapsed = !this.panelCollapsed;
    this.cdr.detectChanges();
  }

  // ── PANEL: vinculación con mapa ───────────────────────────────

  seleccionarAeropuerto(codigo: string, fuente: 'mapa' | 'panel' = 'panel'): void {
    this.selectedAeropuertoCod = this.selectedAeropuertoCod === codigo ? null : codigo;

    if (fuente === 'panel' && this.selectedAeropuertoCod) {
      this.panToAeropuerto(codigo);
    }
    if (fuente === 'mapa') {
      if (this.activeTab !== 'almacenes') { this.activeTab = 'almacenes'; }
      this.scrollPanelACodigo(codigo);
    }

    this.cdr.detectChanges();
  }

  private panToAeropuerto(codigo: string): void {
    const svgPos = this.aeropuertoSvgMap.get(codigo);
    if (!svgPos || !this.renderBounds.cw) return;
    const rb = this.renderBounds;
    const screenX = rb.left + (svgPos.x / this.SVG_W) * rb.imgW;
    const screenY = rb.top  + (svgPos.y / this.SVG_H) * rb.imgH;
    if (this.zoomLevel < 2.5) { this.zoomLevel = 2.5; }
    this.panX = (rb.cw / 2 - screenX) * (this.zoomLevel - 1);
    this.panY = (rb.ch / 2 - screenY) * (this.zoomLevel - 1);
    this.clampPan();
    this.cdr.detectChanges();
  }

  private scrollPanelACodigo(codigo: string): void {
    setTimeout(() => {
      const el = document.querySelector(`[data-codigo="${codigo}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  seleccionarVuelo(codigoVuelo: string, fuente: 'mapa' | 'panel' = 'panel'): void {
    if (fuente === 'mapa') {
      // Click en avión → ir a su detalle en "Vuelos / UT": seleccionar (no alternar),
      // abrir el tab, limpiar filtros para garantizar que el vuelo sea visible y hacer scroll.
      this.selectedVueloCod   = codigoVuelo;
      this.activeTab          = 'vuelos';
      this.filtroVueloCodigo  = '';
      this.filtroVueloOrigen  = '';
      this.filtroVueloDestino = '';
      this.aplicarFiltrosVuelos();
      this.scrollPanelACodigo('vuelo-' + codigoVuelo);
    } else {
      this.selectedVueloCod = this.selectedVueloCod === codigoVuelo ? null : codigoVuelo;
    }
    this.cdr.detectChanges();
  }

  seleccionarEnvio(envio: EnvioPanel): void {
    if (this.selectedEnvioId === envio.id) {
      this.selectedEnvioId = null;
      this.rutaArcos = [];
    } else {
      this.selectedEnvioId = envio.id;
      this.mostrarRutaEnMapa(envio.vuelos);
    }
    this.cdr.detectChanges();
  }

  private mostrarRutaEnMapa(vueloCodigos: string[]): void {
    const arcos: ArcoVuelo[] = [];
    for (const codigo of vueloCodigos) {
      const vuelo = this.panelVuelosRaw.find(v => v.codigoVuelo === codigo);
      const origen  = vuelo?.origen  ?? this.encontrarOrigenDeVuelo(codigo);
      const destino = vuelo?.destino ?? this.encontrarDestinoDeVuelo(codigo);
      if (!origen || !destino) continue;
      const o = this.aeropuertoSvgMap.get(origen);
      const d = this.aeropuertoSvgMap.get(destino);
      if (o && d) {
        const fakeVuelo: VueloAnimacion = {
          codigoVuelo: codigo, origen, destino,
          horaSalidaMs: 0, horaLlegadaMs: 0,
          totalMaletas: vuelo?.totalMaletas ?? 0
        };
        arcos.push({ d: this.calcArco(o.x, o.y, d.x, d.y), vuelo: fakeVuelo, esRuta: true });
      }
    }
    this.rutaArcos = arcos;
  }

  private encontrarOrigenDeVuelo(codigo: string): string | null {
    const v = this.vuelosAnimacion.find(a => a.codigoVuelo === codigo);
    return v?.origen ?? null;
  }

  private encontrarDestinoDeVuelo(codigo: string): string | null {
    const v = this.vuelosAnimacion.find(a => a.codigoVuelo === codigo);
    return v?.destino ?? null;
  }

  verEnviosDeVuelo(vuelo: VueloPanel): void {
    this.activeTab = 'envios';
    this.filtroEnvioOrigen  = '';
    this.filtroEnvioDestino = '';
    this.panelEnvios = this.panelEnviosRaw.filter(e => e.vuelos.includes(vuelo.codigoVuelo));
    this.cdr.detectChanges();
  }

  verEnviosDeAlmacen(almacen: AlmacenPanel, tipo: 'origen' | 'destino'): void {
    this.activeTab = 'envios';
    if (tipo === 'origen') {
      this.filtroEnvioOrigen  = almacen.codigo;
      this.filtroEnvioDestino = '';
    } else {
      this.filtroEnvioOrigen  = '';
      this.filtroEnvioDestino = almacen.codigo;
    }
    this.aplicarFiltrosEnvios();
    this.cdr.detectChanges();
  }

  // ── PANEL: helpers de semáforo ────────────────────────────────

  getSemaforoClass(semaforo: string): string {
    switch (semaforo) {
      case 'VERDE':    return 'sem-verde';
      case 'AMARILLO': return 'sem-amarillo';
      case 'ROJO':     return 'sem-rojo';
      default:         return 'sem-vacio';
    }
  }

  getSemaforoMapClass(codigo: string): string {
    const a = this.panelAlmacenesRaw.find(a => a.codigo === codigo);
    return a ? this.getSemaforoClass(a.semaforo) : 'sem-vacio';
  }

  getSemaforoVueloMapClass(codigo: string): string {
    const v = this.panelVuelosRaw.find(v => v.codigoVuelo === codigo);
    return v ? this.getSemaforoClass(v.semaforo) : 'sem-vacio';
  }

  formatHora(iso: string): string {
    if (!iso || iso.length < 16) return '--:--';
    return iso.substring(11, 16);
  }

  // ── ANIMACIÓN ────────────────────────────────────────────────

  private iniciarAnimacion(): void {
    if (this.animInterval) return; // ya corriendo — el reloj es continuo

    this.ngZone.runOutsideAngular(() => {
      this.animInterval = setInterval(() => {
        // Extrapolar el reloj autoritativo del backend: simTime = base + (real transcurrido) * K
        this.simTimeMs = this.relojBaseMs + (Date.now() - this.relojRecvMs) * this.kFactor;
        this.actualizarPosicionAviones();
        this.cdr.detectChanges();
      }, this.TICK_MS);
    });
  }

  private actualizarPosicionAviones(): void {
    const now = this.simTimeMs;
    const enVuelo = this.vuelosAnimacion.filter(
      v => now >= v.horaSalidaMs && now < v.horaLlegadaMs
    );

    this.arcosVuelo = enVuelo
      .map(v => {
        const o = this.aeropuertoSvgMap.get(v.origen);
        const d = this.aeropuertoSvgMap.get(v.destino);
        if (!o || !d) return null;
        return { d: this.calcArco(o.x, o.y, d.x, d.y), vuelo: v };
      })
      .filter((x): x is ArcoVuelo => x !== null);

    this.planosEnMapa = enVuelo
      .map(v => {
        const t = (now - v.horaSalidaMs) / (v.horaLlegadaMs - v.horaSalidaMs);
        const o = this.aeropuertoSvgMap.get(v.origen);
        const d = this.aeropuertoSvgMap.get(v.destino);
        if (!o || !d) return null;
        const cp  = this.ctrlPoint(o.x, o.y, d.x, d.y);
        const pos = this.bezierPt(t, o.x, o.y, cp.x, cp.y, d.x, d.y);
        const tan = this.bezierTan(t, o.x, o.y, cp.x, cp.y, d.x, d.y);
        return {
          vuelo: v, x: pos.x, y: pos.y,
          angulo: Math.atan2(tan.dy, tan.dx) * 180 / Math.PI + 90
        };
      })
      .filter((x): x is PlanoEnMapa => x !== null);
  }

  private limpiarAnimacion(): void {
    if (this.animInterval) { clearInterval(this.animInterval); this.animInterval = null; }
    this.vuelosAnimacion = [];
    this.planosEnMapa    = [];
    this.arcosVuelo      = [];
    this.rutaArcos       = [];
  }

  // ── GETTERS para template ────────────────────────────────────

  /** Total de pedidos procesados (asignados + no asignados). */
  get statsTotalPedidos(): number {
    return this.statsPedidosAsignados + this.statsPedidosNoAsignados;
  }

  get ventanaLabel(): string {
    if (!this.ventanaActualInicio) return '';
    return new Date(this.ventanaActualInicio).toLocaleString('es-PE', {
      weekday: 'short', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  get horaSimuladaLabel(): string {
    const ms = (this.estadoMonitoreo === 'animando' && this.simTimeMs)
      ? this.simTimeMs
      : (this.ventanaActualInicio?.getTime() ?? 0);
    if (!ms) return '--:--';
    return new Date(ms).toLocaleString('es-PE', {
      weekday: 'short', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  get planosActivos(): number { return this.planosEnMapa.length; }

  // ── ZOOM / PAN ───────────────────────────────────────────────

  get transformStyle(): string {
    if (this.zoomLevel === 1 && this.panX === 0 && this.panY === 0) return 'none';
    return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
  }

  get cursorStyle(): string {
    if (this.zoomLevel <= 1) return 'default';
    return this.isDragging ? 'grabbing' : 'grab';
  }

  onMapWheel(event: WheelEvent): void {
    if (!this.isFullscreen) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.15 : 0.15;
    this.zoomLevel = Math.max(1, Math.min(6, this.zoomLevel + delta));
    if (this.zoomLevel <= 1) { this.zoomLevel = 1; this.panX = 0; this.panY = 0; }
    else this.clampPan();
    this.cdr.detectChanges();
  }

  onMapMouseDown(event: MouseEvent): void {
    if (this.zoomLevel <= 1) return;
    this.isDragging = true;
    this.dragStartX = event.clientX - this.panX;
    this.dragStartY = event.clientY - this.panY;
    event.preventDefault();
  }

  onMapMouseMove(event: MouseEvent): void {
    if (!this.isDragging) return;
    this.panX = event.clientX - this.dragStartX;
    this.panY = event.clientY - this.dragStartY;
    this.clampPan();
    this.cdr.detectChanges();
  }

  onMapMouseUp(): void { this.isDragging = false; }

  zoomIn():    void { this.zoomLevel = Math.min(6, this.zoomLevel + 0.5); this.clampPan(); this.cdr.detectChanges(); }
  zoomOut():   void { this.zoomLevel = Math.max(1, this.zoomLevel - 0.5); if (this.zoomLevel <= 1) { this.panX = 0; this.panY = 0; } else this.clampPan(); this.cdr.detectChanges(); }
  resetZoom(): void { this.zoomLevel = 1; this.panX = 0; this.panY = 0; this.cdr.detectChanges(); }

  private clampPan(): void {
    const el = this.mapContainerEl?.nativeElement;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const maxX = (w / 2) * (this.zoomLevel - 1);
    const maxY = (h / 2) * (this.zoomLevel - 1);
    this.panX = Math.max(-maxX, Math.min(maxX, this.panX));
    this.panY = Math.max(-maxY, Math.min(maxY, this.panY));
  }

  // ── FULLSCREEN ───────────────────────────────────────────────

  toggleFullscreen(): void {
    const el = this.mapContainerEl?.nativeElement;
    if (!el) return;
    if (!document.fullscreenElement) { el.requestFullscreen().catch(() => {}); }
    else { document.exitFullscreen(); }
  }

  // ── TOOLTIP ──────────────────────────────────────────────────

  onPlaneHover(event: MouseEvent, p: PlanoEnMapa): void {
    const rect = this.mapContainerEl?.nativeElement?.getBoundingClientRect();
    const relX = rect ? event.clientX - rect.left : event.offsetX;
    const relY = rect ? event.clientY - rect.top  : event.offsetY;
    const flip = rect ? relX > rect.width - 220 : false;
    const vPanel = this.panelVuelosRaw.find(v => v.codigoVuelo === p.vuelo.codigoVuelo);
    const pct = vPanel ? `${vPanel.ocupacionPct}%` : '';
    this.tooltip = {
      visible: true,
      x: flip ? relX - 220 : relX + 14,
      y: relY + 14,
      lines: [
        `Vuelo ${p.vuelo.codigoVuelo}`,
        `${p.vuelo.origen} → ${p.vuelo.destino}`,
        `${p.vuelo.totalMaletas} maletas${pct ? ' (' + pct + ')' : ''}`,
        `Llegada: ${new Date(p.vuelo.horaLlegadaMs).toLocaleString('es-PE', { hour: '2-digit', minute: '2-digit' })}`
      ]
    };
  }

  onHoverEnd(): void { this.tooltip.visible = false; }

  // ── AEROPUERTOS ──────────────────────────────────────────────

  cargarAeropuertos(): void {
    this.aeropuertoService.listarAeropuertos().subscribe({
      next: (response) => {
        this.aeropuertos = response.data ?? [];
        this.continentes = [...new Set(this.aeropuertos.map(a => a.continente))].sort();

        this.aeropuertoSvgMap.clear();
        this.aeropuertos.forEach(a => {
          const lat = this.parseDMS(a.latitud);
          const lon = this.parseDMS(a.longitud);
          this.aeropuertoSvgMap.set(a.codigoOaci, { x: this.lonToX(lon), y: this.latToY(lat) });
        });

        this.cdr.detectChanges();
        setTimeout(() => { this.medirYEnriquecer(); this.cdr.detectChanges(); }, 50);
        this.onCargaCompleta();
      },
      error: () => {
        this.error = true;
        this.cdr.detectChanges();
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar los aeropuertos.' });
        this.onCargaCompleta();
      }
    });
  }

  // ── PROYECCIÓN SVG ───────────────────────────────────────────

  lonToX(lon: number): number { return ((lon + 180) / 360) * this.SVG_W; }
  latToY(lat: number): number { return ((this.LAT_MAX - lat) / (this.LAT_MAX - this.LAT_MIN)) * this.SVG_H; }

  // ── BEZIER ───────────────────────────────────────────────────

  private ctrlPoint(x1: number, y1: number, x2: number, y2: number) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1,       dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const c = Math.min(len * 0.22, 120);
    return { x: mx + (-dy / len) * c, y: my + (dx / len) * c };
  }

  calcArco(x1: number, y1: number, x2: number, y2: number): string {
    const cp = this.ctrlPoint(x1, y1, x2, y2);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cp.x.toFixed(1)} ${cp.y.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  private bezierPt(t: number, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) {
    const u = 1 - t;
    return { x: u*u*x1 + 2*u*t*cx + t*t*x2, y: u*u*y1 + 2*u*t*cy + t*t*y2 };
  }

  private bezierTan(t: number, x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) {
    const u = 1 - t;
    return { dx: 2*u*(cx-x1) + 2*t*(x2-cx), dy: 2*u*(cy-y1) + 2*t*(y2-cy) };
  }

  // ── POSICIONAMIENTO CSS ──────────────────────────────────────

  private medirYEnriquecer(): void {
    this.medirContenedor();
    this.enriquecerTodosAeropuertos();
  }

  private medirContenedor(): void {
    const el = this.mapContainerEl?.nativeElement;
    if (!el) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    if (!cw || !ch) return;
    const iRatio = this.SVG_W / this.SVG_H;
    const cRatio = cw / ch;
    let imgW: number, imgH: number;
    if (cRatio > iRatio) { imgH = ch; imgW = imgH * iRatio; }
    else                 { imgW = cw; imgH = imgW / iRatio; }
    this.renderBounds = { left: (cw-imgW)/2, top: (ch-imgH)/2, imgW, imgH, cw, ch };
  }

  private calcPosicion(latStr: string, lngStr: string): { x: number; y: number } {
    const lat = this.parseDMS(latStr);
    const lng = this.parseDMS(lngStr);
    const fx = (lng - this.LNG_MIN) / (this.LNG_MAX - this.LNG_MIN);
    const fy = (this.LAT_MAX - lat) / (this.LAT_MAX - this.LAT_MIN);
    if (!this.renderBounds.cw) return { x: fx * 100, y: fy * 100 };
    const px = this.renderBounds.left + fx * this.renderBounds.imgW;
    const py = this.renderBounds.top  + fy * this.renderBounds.imgH;
    return { x: (px / this.renderBounds.cw) * 100, y: (py / this.renderBounds.ch) * 100 };
  }

  private enriquecerTodosAeropuertos(): void {
    if (!this.aeropuertos.length) return;
    this.maxCapacidad = Math.max(...this.aeropuertos.map(a => a.capacidad), 1);
    this.aeropuertosMapa = this.aeropuertos.map(a => this.enriquecerAeropuerto(a));
    const base = this.continenteSeleccionado
      ? this.aeropuertosMapa.filter(a => a.continente === this.continenteSeleccionado)
      : this.aeropuertosMapa;
    this.aeropuertosFiltrados = [...base];
  }

  private enriquecerAeropuerto(a: Aeropuerto): AeropuertoMapa {
    const pos = this.calcPosicion(a.latitud, a.longitud);
    return { ...a, x: pos.x, y: pos.y, storagePct: Math.round((a.capacidad / this.maxCapacidad) * 100) };
  }

  parseDMS(dms: string): number {
    const match = dms.match(/(\d+)\D+(\d+)\D+([\d.]+)\D*([NSEWnsew])/);
    if (!match) return parseFloat(dms) || 0;
    const [, deg, min, sec, dir] = match;
    let decimal = +deg + +min / 60 + +sec / 3600;
    if (dir === 'S' || dir === 's' || dir === 'W' || dir === 'w') decimal = -decimal;
    return decimal;
  }

  // ── FILTROS DEL MAPA ─────────────────────────────────────────

  onContinenteChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.filtrarPorContinente(val || null);
  }

  filtrarPorContinente(continente: string | null): void {
    this.continenteSeleccionado = continente;
    this.aeropuertosFiltrados = continente
      ? this.aeropuertosMapa.filter(a => a.continente === continente)
      : [...this.aeropuertosMapa];
  }

  filtrarTabla(event: Event): void {
    const texto = (event.target as HTMLInputElement).value.toLowerCase();
    const base = this.continenteSeleccionado
      ? this.aeropuertosMapa.filter(a => a.continente === this.continenteSeleccionado)
      : this.aeropuertosMapa;
    this.aeropuertosFiltrados = base.filter(a =>
      a.codigoOaci.toLowerCase().includes(texto) ||
      a.ciudad.toLowerCase().includes(texto)     ||
      a.pais.toLowerCase().includes(texto)       ||
      a.codigo.toLowerCase().includes(texto)
    );
  }

  // ── UTILIDADES ───────────────────────────────────────────────

  getActivoClass(activo: boolean): string { return activo ? 'badge-activo' : 'badge-inactivo'; }
  getActivosCount(): number { return this.aeropuertosFiltrados.filter(a => a.activo).length; }

  trackPlano(_: number, p: PlanoEnMapa):    string { return p.vuelo.codigoVuelo; }
  trackArco (_: number, a: ArcoVuelo):      string { return a.vuelo.codigoVuelo + (a.esRuta ? '-r' : ''); }
  trackAero (_: number, a: Aeropuerto):     string { return a.codigoOaci; }
  trackAlmacen(_: number, a: AlmacenPanel): string { return a.codigo; }
  trackVueloP(_: number, v: VueloPanel):    string { return v.codigoVuelo; }
  trackEnvioP(_: number, e: EnvioPanel):    string { return e.id; }
}
