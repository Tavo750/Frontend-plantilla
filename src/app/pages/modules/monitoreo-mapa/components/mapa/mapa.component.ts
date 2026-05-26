import { Component, OnInit, OnDestroy, ViewChild, ElementRef, HostListener, ChangeDetectorRef } from '@angular/core';
import { MessageService } from 'primeng/api';
import { AeropuertoService, Aeropuerto } from '../../../../../core/services/aeropuerto.service';

interface AeropuertoMapa extends Aeropuerto {
  x: number;
  y: number;
  storagePct: number;
}

@Component({
  selector: 'app-mapa',
  standalone: false,
  templateUrl: './mapa.component.html',
  styleUrl: './mapa.component.css'
})
export class MapaComponent implements OnInit, OnDestroy {
  aeropuertos: Aeropuerto[] = [];
  aeropuertosFiltrados: AeropuertoMapa[] = [];
  private aeropuertosMapa: AeropuertoMapa[] = [];
  cargando = false;
  error = false;
  autoRefresh = false;

  continenteSeleccionado: string | null = null;
  continentes: string[] = [];

  private maxCapacidad = 1;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  // ─── ViewChild para medir el contenedor real en el DOM ──────────────────────
  @ViewChild('mapContainerEl') mapContainerEl!: ElementRef<HTMLDivElement>;

  // Bounds calculados a partir del contenedor real + object-fit:contain
  private renderBounds = { left: 0, top: 0, imgW: 0, imgH: 0, cw: 0, ch: 0 };

  // ─── Bounds geográficos del Simplemaps world.svg (viewBox: 0 0 2000 857) ────
  // El SVG es equirectangular con escala uniforme de 5.556 px/grado
  // (2000px / 360° = 5.556; 857px / 154.3° = 5.556)
  // Lat top = 84°N  ·  Lat bottom = -70.3°S  ·  Lng -180° a +180°
  private readonly SVG_W = 2000;
  private readonly SVG_H = 857;
  private readonly LAT_MAX = 84;
  private readonly LAT_MIN = -70.3;
  private readonly LNG_MIN = -180;
  private readonly LNG_MAX = 180;

  readonly worldMapUrl = '/world.svg';

  constructor(
    private readonly aeropuertoService: AeropuertoService,
    private readonly messageService: MessageService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.cargarAeropuertos();
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  // ─── Recalcular posiciones cuando cambia el tamaño de la ventana ─────────────
  @HostListener('window:resize')
  onResize(): void {
    this.medirYEnriquecer();
  }

  // ─── Disparado por (load) en el <img>: DOM y dimensiones ya están listos ─────
  onMapLoaded(): void {
    this.medirYEnriquecer();
  }

  // ─── Mide el contenedor y re-enriquece todos los aeropuertos ─────────────────
  private medirYEnriquecer(): void {
    this.medirContenedor();
    this.enriquecerTodosAeropuertos();
  }

  // ─── Calcula el área real que ocupa la imagen dentro del contenedor ───────────
  // object-fit: contain centra la imagen y deja márgenes (letterbox)
  // Necesitamos saber EXACTAMENTE dónde empieza/termina la imagen
  private medirContenedor(): void {
    const el = this.mapContainerEl?.nativeElement;
    if (!el) return;

    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (!cw || !ch) return;

    // Aspect ratio del SVG (2000/857 ≈ 2.334:1)
    const iRatio = this.SVG_W / this.SVG_H;
    const cRatio = cw / ch;

    let imgW: number, imgH: number;

    if (cRatio > iRatio) {
      // Contenedor más ancho que la imagen → imagen encaja por altura, márgenes laterales
      imgH = ch;
      imgW = imgH * iRatio;
    } else {
      // Contenedor más alto → imagen encaja por anchura, márgenes arriba/abajo (letterbox)
      imgW = cw;
      imgH = imgW / iRatio;
    }

    this.renderBounds = {
      left: (cw - imgW) / 2,
      top: (ch - imgH) / 2,
      imgW, imgH, cw, ch
    };
  }

  // ─── Conversión geográfica: lat/lng → porcentaje en el CONTENEDOR ─────────────
  private calcPosicion(latStr: string, lngStr: string): { x: number; y: number } {
    const lat = this.parseDMS(latStr);
    const lng = this.parseDMS(lngStr);

    // Fracción dentro del área geográfica del SVG (0–1)
    const fx = (lng - this.LNG_MIN) / (this.LNG_MAX - this.LNG_MIN);
    const fy = (this.LAT_MAX - lat) / (this.LAT_MAX - this.LAT_MIN);

    // Si el contenedor aún no fue medido, devolvemos posición aproximada como fallback
    if (!this.renderBounds.cw) {
      return { x: fx * 100, y: fy * 100 };
    }

    // Corregir el letterbox: convertir fracción de SVG a píxeles dentro del contenedor
    const px = this.renderBounds.left + fx * this.renderBounds.imgW;
    const py = this.renderBounds.top + fy * this.renderBounds.imgH;

    return {
      x: (px / this.renderBounds.cw) * 100,
      y: (py / this.renderBounds.ch) * 100
    };
  }

  // ─── Backend ──────────────────────────────────────────────────────────────────

  cargarAeropuertos(): void {
    this.cargando = true;
    this.error = false;

    this.aeropuertoService.listarAeropuertos().subscribe({
      next: (response) => {
        this.aeropuertos = response.data ?? [];
        this.continentes = [...new Set(this.aeropuertos.map(a => a.continente))].sort();
        this.cargando = false;
        this.cdr.detectChanges();
        // Espera a que Angular renderice el contenedor antes de medirlo
        setTimeout(() => {
          this.medirYEnriquecer();
          // Si la imagen ya estaba cacheada el evento (load) no dispara: forzar medición
          const img = this.mapContainerEl?.nativeElement?.querySelector('img') as HTMLImageElement | null;
          if (img?.complete) this.medirYEnriquecer();
          this.cdr.detectChanges();
        }, 50);
      },
      error: () => {
        this.cargando = false;
        this.error = true;
        this.cdr.detectChanges();
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo cargar la lista de aeropuertos.'
        });
      }
    });
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
    return {
      ...a,
      x: pos.x,
      y: pos.y,
      storagePct: Math.round((a.capacidad / this.maxCapacidad) * 100)
    };
  }

  // ─── Parser DMS: "04° 42' 05" N" → decimal ───────────────────────────────────
  parseDMS(dms: string): number {
    const match = dms.match(/(\d+)\D+(\d+)\D+([\d.]+)\D*([NSEWnsew])/);
    if (!match) return 0;
    const [, deg, min, sec, dir] = match;
    let decimal = +deg + +min / 60 + +sec / 3600;
    if (dir === 'S' || dir === 's' || dir === 'W' || dir === 'w') decimal = -decimal;
    return decimal;
  }

  // ─── Filtros ──────────────────────────────────────────────────────────────────

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
      a.ciudad.toLowerCase().includes(texto) ||
      a.pais.toLowerCase().includes(texto) ||
      a.codigo.toLowerCase().includes(texto)
    );
  }

  toggleRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    if (this.autoRefresh) {
      this.cargarAeropuertos();
      this.refreshInterval = setInterval(() => this.cargarAeropuertos(), 30000);
    } else {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
    }
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────────

  getActivoClass(activo: boolean): string {
    return activo ? 'badge-activo' : 'badge-inactivo';
  }

  getContarPorContinente(continente: string): number {
    return this.aeropuertos.filter(a => a.continente === continente).length;
  }

  getTotalCapacidad(): number {
    return this.aeropuertosFiltrados.reduce((sum, a) => sum + a.capacidad, 0);
  }

  getActivosCount(): number {
    return this.aeropuertosFiltrados.filter(a => a.activo).length;
  }
}
