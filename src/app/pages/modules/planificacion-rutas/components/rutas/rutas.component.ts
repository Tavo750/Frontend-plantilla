import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef, HostListener } from '@angular/core';
import { MessageService } from 'primeng/api';

import { EnvioService, EnvioMaletas } from '../../../../../core/services/envio.service';
import { AeropuertoService, Aeropuerto } from '../../../../../core/services/aeropuerto.service';

interface ArcoRuta {
  d:      string;
  origen: string;
  destino:string;
  label:  string;
}

@Component({
  selector:    'app-rutas',
  standalone:  false,
  templateUrl: './rutas.component.html',
  styleUrl:    './rutas.component.css'
})
export class RutasComponent implements OnInit {

  envios:      EnvioMaletas[] = [];
  aeropuertos: Aeropuerto[]   = [];
  continentes: string[]        = [];

  envioSeleccionado:   EnvioMaletas | null  = null;
  enviosSeleccionados: EnvioMaletas[]       = [];

  cargando = false;
  error    = false;

  // ── Mapa SVG ─────────────────────────────────────────────────
  @ViewChild('mapaContainerEl') mapaContainerEl?: ElementRef<HTMLDivElement>;
  readonly SVG_W   = 2000;
  readonly SVG_H   = 857;
  readonly LAT_MAX = 84;
  readonly LAT_MIN = -70.3;
  readonly LNG_MIN = -180;
  readonly LNG_MAX = 180;
  readonly worldMapUrl = '/world.svg';

  aeropuertoSvgMap = new Map<string, { x: number; y: number }>();
  arcosRuta: ArcoRuta[] = [];
  aeropuertosEnMapa: { codigo: string; x: number; y: number; ciudad: string }[] = [];

  // filtro continente para la tabla
  filtroContinente = '';
  filtroTexto      = '';
  aeropuertosFiltrados: Aeropuerto[] = [];

  constructor(
    private readonly envioService:      EnvioService,
    private readonly aeropuertoService: AeropuertoService,
    private readonly messageService:    MessageService,
    private readonly cdr:               ChangeDetectorRef
  ) {}

  ngOnInit(): void { this.cargarDatos(); }

  @HostListener('window:resize')
  onResize(): void { /* mapa SVG es responsive vía viewBox */ }

  cargarDatos(): void {
    this.cargarEnvios();
    this.cargarAeropuertos();
  }

  cargarEnvios(): void {
    this.cargando = true;
    this.error = false;
    this.envioService.listarEnvios().subscribe({
      next: (response) => {
        this.envios   = response.data ?? [];
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
        this.error    = true;
        this.cdr.detectChanges();
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la lista de envíos' });
      }
    });
  }

  cargarAeropuertos(): void {
    this.aeropuertoService.listarAeropuertos().subscribe({
      next: (response) => {
        this.aeropuertos  = response.data ?? [];
        this.continentes  = [...new Set(this.aeropuertos.map(a => a.continente))].sort();
        this.aeropuertosFiltrados = [...this.aeropuertos];

        this.aeropuertoSvgMap.clear();
        this.aeropuertos.forEach(a => {
          const lat = this.parseDMS(a.latitud);
          const lon = this.parseDMS(a.longitud);
          this.aeropuertoSvgMap.set(a.codigoOaci, { x: this.lonToX(lon), y: this.latToY(lat) });
        });

        this.aeropuertosEnMapa = this.aeropuertos
          .filter(a => a.activo)
          .map(a => ({
            codigo: a.codigoOaci,
            ciudad: a.ciudad,
            x:      this.aeropuertoSvgMap.get(a.codigoOaci)?.x ?? 0,
            y:      this.aeropuertoSvgMap.get(a.codigoOaci)?.y ?? 0
          }));

        this.recalcularArcos();
        this.cdr.detectChanges();
      },
      error: () => this.messageService.add({ severity: 'warn', summary: 'Advertencia', detail: 'No se pudieron cargar los aeropuertos' })
    });
  }

  agregarEnvioSeleccionado(): void {
    if (!this.envioSeleccionado) return;
    const existe = this.enviosSeleccionados.some(e => e.idEnvio === this.envioSeleccionado?.idEnvio);
    if (!existe) {
      this.enviosSeleccionados = [...this.enviosSeleccionados, this.envioSeleccionado];
      this.recalcularArcos();
    }
    this.envioSeleccionado = null;
  }

  eliminarEnvio(idEnvio: number): void {
    this.enviosSeleccionados = this.enviosSeleccionados.filter(e => e.idEnvio !== idEnvio);
    this.recalcularArcos();
  }

  limpiarSeleccion(): void {
    this.enviosSeleccionados = [];
    this.arcosRuta = [];
  }

  // ── Mapa: construir arcos ────────────────────────────────────

  private recalcularArcos(): void {
    const arcos: ArcoRuta[] = [];
    for (const env of this.enviosSeleccionados) {
      const orig = env.aeropuertoOrigen?.codigoOaci;
      const dest = env.aeropuertoDestino?.codigoOaci;
      if (!orig || !dest) continue;
      const o = this.aeropuertoSvgMap.get(orig);
      const d = this.aeropuertoSvgMap.get(dest);
      if (!o || !d) continue;
      arcos.push({
        d:       this.calcArco(o.x, o.y, d.x, d.y),
        origen:  orig,
        destino: dest,
        label:   `#${env.idEnvio} ${orig}→${dest}`
      });
    }
    this.arcosRuta = arcos;
  }

  private calcArco(x1: number, y1: number, x2: number, y2: number): string {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const c = Math.min(len * 0.25, 140);
    const cpx = mx + (-dy / len) * c, cpy = my + (dx / len) * c;
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  lonToX(lon: number): number { return ((lon + 180) / 360) * this.SVG_W; }
  latToY(lat: number): number { return ((this.LAT_MAX - lat) / (this.LAT_MAX - this.LAT_MIN)) * this.SVG_H; }

  parseDMS(dms: string): number {
    const match = dms.match(/(\d+)\D+(\d+)\D+([\d.]+)\D*([NSEWnsew])/);
    if (!match) return parseFloat(dms) || 0;
    const [, deg, min, sec, dir] = match;
    let decimal = +deg + +min / 60 + +sec / 3600;
    if (dir === 'S' || dir === 's' || dir === 'W' || dir === 'w') decimal = -decimal;
    return decimal;
  }

  // ── Tabla aeropuertos ────────────────────────────────────────

  filtrarTablaAeropuertos(): void {
    let lista = [...this.aeropuertos];
    if (this.filtroContinente) lista = lista.filter(a => a.continente === this.filtroContinente);
    if (this.filtroTexto) {
      const q = this.filtroTexto.toLowerCase();
      lista = lista.filter(a =>
        a.codigoOaci.toLowerCase().includes(q) ||
        a.ciudad.toLowerCase().includes(q) ||
        a.pais.toLowerCase().includes(q)
      );
    }
    this.aeropuertosFiltrados = lista;
  }

  // ── Helpers ──────────────────────────────────────────────────

  getEstadoClass(estado: string): string {
    const mapa: Record<string, string> = {
      REGISTRADA:  'badge-registrada',
      EN_TRANSITO: 'badge-transito',
      ENTREGADA:   'badge-entregada',
      RETRASADA:   'badge-retrasada',
      EN_ESPERA:   'badge-espera'
    };
    return mapa[estado] ?? 'badge-default';
  }

  getTotalMaletas():        number { return this.enviosSeleccionados.reduce((s, e) => s + e.cantidad, 0); }
  getTotalEnvios():         number { return this.enviosSeleccionados.length; }

  getRutasNacionales():     number {
    return this.enviosSeleccionados.filter(e => e.aeropuertoOrigen?.pais === e.aeropuertoDestino?.pais).length;
  }

  getRutasInternacionales(): number {
    return this.enviosSeleccionados.filter(e => e.aeropuertoOrigen?.pais !== e.aeropuertoDestino?.pais).length;
  }

  getRutasMismoContinente(): number {
    return this.enviosSeleccionados.filter(e =>
      this.obtenerAeropuertoPorCodigo(e.aeropuertoOrigen?.codigoOaci ?? '')?.continente ===
      this.obtenerAeropuertoPorCodigo(e.aeropuertoDestino?.codigoOaci ?? '')?.continente
    ).length;
  }

  getRutasDistintoContinente(): number {
    return this.enviosSeleccionados.filter(e =>
      this.obtenerAeropuertoPorCodigo(e.aeropuertoOrigen?.codigoOaci ?? '')?.continente !==
      this.obtenerAeropuertoPorCodigo(e.aeropuertoDestino?.codigoOaci ?? '')?.continente
    ).length;
  }

  obtenerAeropuertoPorCodigo(codigoOaci: string): Aeropuerto | undefined {
    return this.aeropuertos.find(a => a.codigoOaci === codigoOaci);
  }

  trackByEnvio(_: number, envio: EnvioMaletas): number { return envio.idEnvio; }
  trackByAero (_: number, a: Aeropuerto):      number  { return a.idAeropuerto; }

  getPaisAeropuerto(codigoOaci?: string): string {
    if (!codigoOaci) return '—';
    return this.obtenerAeropuertoPorCodigo(codigoOaci)?.pais ?? '—';
  }

  getContinenteAeropuerto(codigoOaci?: string): string {
    if (!codigoOaci) return '—';
    return this.obtenerAeropuertoPorCodigo(codigoOaci)?.continente ?? '—';
  }
}
