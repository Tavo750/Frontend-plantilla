import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';

import { AeropuertoService, Aeropuerto } from '../../../../../core/services/aeropuerto.service';
import { VueloService, Vuelo, VueloCreateDTO, EstadoVuelo } from '../../../../../core/services/vuelo.service';

@Component({
  selector: 'app-vuelo',
  standalone: false,
  templateUrl: './vuelo.component.html',
  styleUrl: './vuelo.component.css'
})
export class VueloComponent implements OnInit {

  idAeropuertoOrigen: number | null = null;

  codigoVuelo = '';
  idAeropuertoDestino: number | null = null;
  horaSalida = '';
  horaLlegada = '';
  duracionHoras = 1;
  capacidadMaxima = 150;
  estado: EstadoVuelo = 'PROGRAMADO';
  esIntercontinental = false;

  aeropuertos: Aeropuerto[] = [];
  continentes: string[] = [];

  cargandoLista = true;
  enviando = false;
  mostrarFormulario = false;
  editando = false;
  idVueloEditando: number | null = null;

  vuelos: Vuelo[] = [];
  vuelosFiltrados: Vuelo[] = [];
  estadoFiltro: EstadoVuelo | null = null;
  textoBusqueda = '';

  mostrarFiltrosAvanzados = false;
  codigoDestinoFiltro: string | null = null;
  continenteDestinoFiltro: string | null = null;
  intercontinentalFiltro: boolean | null = null;
  fechaSalidaDesde: Date | null = null;
  fechaSalidaHasta: Date | null = null;

  cargandoCSV = false;
  csvProgreso = 0;
  csvResultado: { exitosos: number; fallidos: number; errores: string[] } | null = null;

  // ── Eliminación masiva ─────────────────────────────────────
  /** Modo selección: muestra checkboxes en la tabla y el panel de lotes */
  modoSeleccion = false;
  seleccionados = new Set<number>();
  eliminandoMasivo = false;
  mostrarConfirmMasivo = false;

  // ── Carga masiva por tandas ────────────────────────────────
  /** Tandas de carga registradas (fecha_carga), la más reciente primero. */
  tandas: { fechaCarga: string; total: number; desde: string; hasta: string }[] = [];
  eliminandoTanda: string | null = null;

  readonly ESTADOS: { label: string; value: EstadoVuelo | null }[] = [
    { label: 'Todos', value: null },
    { label: 'Programado', value: 'PROGRAMADO' },
    { label: 'Cancelado', value: 'CANCELADO' }
  ];

  readonly ESTADO_COLORS: Record<string, string> = {
    PROGRAMADO: '#4ade80',
    CANCELADO: '#f87171'
  };

  constructor(
    private readonly vueloService: VueloService,
    private readonly aeropuertoService: AeropuertoService,
  
    private readonly messageService: MessageService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.cargarReferencias();
    this.cargarVuelos();
    this.cargarTandas();
  }

  cargarTandas(): void {
    this.vueloService.listarCargas().subscribe({
      next: resp => { this.tandas = resp.data ?? []; this.cdr.detectChanges(); }
    });
  }

  /** Elimina una tanda de carga completa (todos sus vuelos de todos los días). */
  eliminarTanda(t: { fechaCarga: string; total: number }): void {
    this.eliminandoTanda = t.fechaCarga;
    this.vueloService.eliminarCarga(t.fechaCarga).subscribe({
      next: resp => {
        this.eliminandoTanda = null;
        this.messageService.add({
          severity: 'success', summary: 'Tanda eliminada',
          detail: `${resp.data?.eliminados ?? t.total} vuelo(s) eliminados`
        });
        this.cargarTandas();
        this.cargarVuelos();
      },
      error: err => {
        this.eliminandoTanda = null;
        this.messageService.add({
          severity: 'error', summary: 'Error',
          detail: err?.error?.message ?? 'No se pudo eliminar la tanda.'
        });
        this.cdr.detectChanges();
      }
    });
  }

  formatearFechaCarga(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso
      : d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  private cargarReferencias(): void {
    this.aeropuertoService.listarAeropuertos().subscribe({
      next: resp => {
        this.aeropuertos = resp.data ?? [];
        this.continentes = [
          ...new Set(
            this.aeropuertos
              .map(a => a.continente)
              .filter(continente => continente)
          )
        ].sort();

        this.aplicarFiltros();
        this.cdr.detectChanges();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los aeropuertos.'
        });
      }
    });
  }

  cargarVuelos(): void {
    this.cargandoLista = true;

    this.vueloService.listarVuelos().subscribe({
      next: resp => {
        this.vuelos = this.ordenarVuelos(resp.data ?? []);
        this.aplicarFiltros();
        this.cargandoLista = false;
        this.cdr.detectChanges();
      },
      error: err => {
        this.cargandoLista = false;
        this.cdr.detectChanges();

        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message ?? 'No se pudieron cargar los vuelos'
        });
      }
    });
  }

  guardarVuelo(): void {
    if (!this.validarFormulario()) return;

    const dto = this.construirDTO();
    this.enviando = true;

    const peticion = this.editando && this.idVueloEditando !== null
      ? this.vueloService.actualizarVuelo(this.idVueloEditando, dto)
      : this.vueloService.crearVuelo(dto);

    peticion.subscribe({
      next: () => {
        this.enviando = false;
        this.mostrarFormulario = false;

        this.messageService.add({
          severity: 'success',
          summary: this.editando ? 'Vuelo actualizado' : 'Vuelo registrado',
          detail: this.editando
            ? 'El vuelo fue actualizado correctamente.'
            : 'El vuelo fue creado correctamente.'
        });

        this.limpiarFormulario();
        this.limpiarTodosLosFiltrosSinAplicar();
        this.cargarVuelos();
      },
      error: err => {
        this.enviando = false;
        this.cdr.detectChanges();

        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message ?? 'No se pudo guardar el vuelo.'
        });
      }
    });
  }

  private validarFormulario(): boolean {
    if (!this.idAeropuertoOrigen) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Campo requerido',
        detail: 'Seleccione aeropuerto de origen.'
      });
      return false;
    }

    if (!this.codigoVuelo.trim()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Campo requerido',
        detail: 'Ingrese el código de vuelo.'
      });
      return false;
    }

    if (!this.idAeropuertoDestino) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Campo requerido',
        detail: 'Seleccione aeropuerto de destino.'
      });
      return false;
    }

    if (this.idAeropuertoOrigen === this.idAeropuertoDestino) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Ruta inválida',
        detail: 'El origen y destino no pueden ser iguales.'
      });
      return false;
    }

    if (!this.horaSalida || !this.horaLlegada) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Campos requeridos',
        detail: 'Ingrese hora de salida y llegada.'
      });
      return false;
    }

    if (new Date(this.horaLlegada) <= new Date(this.horaSalida)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Fechas inválidas',
        detail: 'La llegada debe ser posterior a la salida.'
      });
      return false;
    }

    if (!this.duracionHoras || this.duracionHoras <= 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Duración inválida',
        detail: 'La duración debe ser mayor a cero.'
      });
      return false;
    }

    if (!this.capacidadMaxima || this.capacidadMaxima < 1) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Capacidad inválida',
        detail: 'La capacidad máxima debe ser mayor a cero.'
      });
      return false;
    }

    return true;
  }

  private construirDTO(): VueloCreateDTO {
    return {
      codigoVuelo: this.codigoVuelo.trim().toUpperCase(),
      idAeropuertoOrigen: Number(this.idAeropuertoOrigen),
      idAeropuertoDestino: Number(this.idAeropuertoDestino),
      horaSalida: this.normalizarLocalDateTime(this.horaSalida),
      horaLlegada: this.normalizarLocalDateTime(this.horaLlegada),
      duracionHoras: Number(this.duracionHoras),
      capacidadMaxima: Number(this.capacidadMaxima),
      estado: this.estado,
      esIntercontinental: Boolean(this.esIntercontinental)
    };
  }

  editarVuelo(vuelo: Vuelo): void {
    this.editando = true;
    this.idVueloEditando = vuelo.idVuelo;
    this.mostrarFormulario = true;

    this.codigoVuelo = vuelo.codigoVuelo;
    this.idAeropuertoOrigen = vuelo.aeropuertoOrigen?.idAeropuerto ?? null;
    this.idAeropuertoDestino = vuelo.aeropuertoDestino?.idAeropuerto ?? null;
    this.horaSalida = this.toDatetimeLocal(vuelo.horaSalida);
    this.horaLlegada = this.toDatetimeLocal(vuelo.horaLlegada);
    this.duracionHoras = Number(vuelo.duracionHoras);
    this.capacidadMaxima = vuelo.capacidadMaxima;
    this.estado = vuelo.estado;
    this.esIntercontinental = vuelo.esIntercontinental;
  }

  eliminarVuelo(vuelo: Vuelo): void {
    if (!confirm(`¿Eliminar el vuelo ${vuelo.codigoVuelo}?`)) return;

    this.vueloService.eliminarVuelo(vuelo.idVuelo).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Vuelo eliminado',
          detail: 'El vuelo fue eliminado correctamente.'
        });

        this.cargarVuelos();
      },
      error: err => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message ?? 'No se pudo eliminar el vuelo.'
        });
      }
    });
  }

  cancelarVuelo(vuelo: Vuelo): void {
    this.vueloService.cancelarVuelo(vuelo.codigoVuelo).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Vuelo cancelado',
          detail: 'El vuelo fue cancelado correctamente.'
        });

        this.cargarVuelos();
      },
      error: err => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message ?? 'No se pudo cancelar el vuelo.'
        });
      }
    });
  }

  reactivarVuelo(vuelo: Vuelo): void {
    this.vueloService.reactivarVuelo(vuelo.codigoVuelo).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Vuelo reactivado',
          detail: 'El vuelo fue reactivado correctamente.'
        });

        this.cargarVuelos();
      },
      error: err => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message ?? 'No se pudo reactivar el vuelo.'
        });
      }
    });
  }

  limpiarFormulario(): void {
    this.codigoVuelo = '';
    this.idAeropuertoOrigen = null;
    this.idAeropuertoDestino = null;
    this.horaSalida = '';
    this.horaLlegada = '';
    this.duracionHoras = 1;
    this.capacidadMaxima = 150;
    this.estado = 'PROGRAMADO';
    this.esIntercontinental = false;
    this.editando = false;
    this.idVueloEditando = null;
  }

  cancelarFormulario(): void {
    this.mostrarFormulario = false;
    this.limpiarFormulario();
  }

  filtrarPorEstado(estado: EstadoVuelo | null): void {
    this.estadoFiltro = estado;
    this.aplicarFiltros();
  }

  onBuscar(event: Event): void {
    this.textoBusqueda = (event.target as HTMLInputElement).value.toLowerCase();
    this.aplicarFiltros();
  }

  aplicarFiltros(): void {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    let base = [...this.vuelos].filter(v => {
      if (!v.horaSalida) return false;

      const fechaSalida = new Date(v.horaSalida);
      return fechaSalida >= hoy;
    });

    if (this.estadoFiltro) {
      base = base.filter(v => v.estado === this.estadoFiltro);
    }

    if (this.textoBusqueda) {
      base = base.filter(v =>
        (v.codigoVuelo ?? '').toLowerCase().includes(this.textoBusqueda) ||
        (v.aeropuertoOrigen?.codigoOaci ?? '').toLowerCase().includes(this.textoBusqueda) ||
        (v.aeropuertoOrigen?.ciudad ?? '').toLowerCase().includes(this.textoBusqueda) ||
        (v.aeropuertoDestino?.codigoOaci ?? '').toLowerCase().includes(this.textoBusqueda) ||
        (v.aeropuertoDestino?.ciudad ?? '').toLowerCase().includes(this.textoBusqueda)
      );
    }

    if (this.codigoDestinoFiltro) {
      base = base.filter(v => v.aeropuertoDestino?.codigoOaci === this.codigoDestinoFiltro);
    }

    if (this.continenteDestinoFiltro) {
      base = base.filter(v =>
        this.buscarAeropuertoCompleto(v.aeropuertoDestino?.idAeropuerto)?.continente === this.continenteDestinoFiltro
      );
    }

    if (this.intercontinentalFiltro !== null) {
      base = base.filter(v => v.esIntercontinental === this.intercontinentalFiltro);
    }

    if (this.fechaSalidaDesde) {
      const d = new Date(this.fechaSalidaDesde);
      d.setHours(0, 0, 0, 0);
      base = base.filter(v => new Date(v.horaSalida) >= d);
    }

    if (this.fechaSalidaHasta) {
      const h = new Date(this.fechaSalidaHasta);
      h.setHours(23, 59, 59, 999);
      base = base.filter(v => new Date(v.horaSalida) <= h);
    }

    this.vuelosFiltrados = this.ordenarVuelos(base);
  }

  private ordenarVuelos(vuelos: Vuelo[]): Vuelo[] {
    return [...vuelos].sort((a, b) => {
      const idA = Number(a.idVuelo ?? 0);
      const idB = Number(b.idVuelo ?? 0);

      if (idA !== idB) {
        return idB - idA;
      }

      const fechaA = new Date(a.horaSalida ?? '').getTime() || 0;
      const fechaB = new Date(b.horaSalida ?? '').getTime() || 0;

      return fechaB - fechaA;
    });
  }

  aplicarFiltrosAvanzados(): void {
    this.aplicarFiltros();
  }

  limpiarFiltrosAvanzados(): void {
    this.codigoDestinoFiltro = null;
    this.continenteDestinoFiltro = null;
    this.intercontinentalFiltro = null;
    this.fechaSalidaDesde = null;
    this.fechaSalidaHasta = null;
    this.aplicarFiltros();
  }

  private limpiarTodosLosFiltrosSinAplicar(): void {
    this.estadoFiltro = null;
    this.textoBusqueda = '';
    this.codigoDestinoFiltro = null;
    this.continenteDestinoFiltro = null;
    this.intercontinentalFiltro = null;
    this.fechaSalidaDesde = null;
    this.fechaSalidaHasta = null;
  }

  getEstadoColor(estado: string): string {
    return this.ESTADO_COLORS[estado] ?? '#94a3b8';
  }

  getAeropuertoById(id: number | null): Aeropuerto | null {
    if (id === null) return null;
    return this.aeropuertos.find(a => a.idAeropuerto === id) ?? null;
  }


  private buscarAeropuertoCompleto(idAeropuerto?: number): Aeropuerto | null {
    if (!idAeropuerto) return null;
    return this.aeropuertos.find(a => a.idAeropuerto === idAeropuerto) ?? null;
  }

  getRutaPreview(): string {
    const o = this.getAeropuertoById(this.idAeropuertoOrigen);
    const d = this.getAeropuertoById(this.idAeropuertoDestino);

    return !o || !d
      ? 'Seleccione origen y destino'
      : `${o.ciudad} (${o.codigoOaci}) → ${d.ciudad} (${d.codigoOaci})`;
  }

  getTipoVueloPreview(): string {
    const o = this.getAeropuertoById(this.idAeropuertoOrigen);
    const d = this.getAeropuertoById(this.idAeropuertoDestino);

    if (!o || !d) return 'Sin ruta';
    if (o.pais === d.pais) return 'Vuelo nacional';
    if (o.continente === d.continente) return 'Vuelo internacional';

    return 'Vuelo intercontinental';
  }

  getTotalCapacidad(): number {
    return this.vuelosFiltrados.reduce((s, v) => s + (v.capacidadMaxima ?? 0), 0);
  }

  getProgramados(): number {
    return this.vuelosFiltrados.filter(v => v.estado === 'PROGRAMADO').length;
  }

  getCancelados(): number {
    return this.vuelosFiltrados.filter(v => v.estado === 'CANCELADO').length;
  }

  // ── ELIMINACIÓN MASIVA ─────────────────────────────────────

  toggleModoSeleccion(): void {
    this.modoSeleccion = !this.modoSeleccion;
    if (!this.modoSeleccion) this.seleccionados.clear();
  }

  toggleSeleccion(v: Vuelo): void {
    if (this.seleccionados.has(v.idVuelo)) this.seleccionados.delete(v.idVuelo);
    else this.seleccionados.add(v.idVuelo);
  }

  /** Selecciona / deselecciona todos los vuelos actualmente FILTRADOS. */
  toggleSeleccionTodos(): void {
    const todos = this.vuelosFiltrados.every(v => this.seleccionados.has(v.idVuelo));
    if (todos) this.vuelosFiltrados.forEach(v => this.seleccionados.delete(v.idVuelo));
    else this.vuelosFiltrados.forEach(v => this.seleccionados.add(v.idVuelo));
  }

  get todosFiltradosSeleccionados(): boolean {
    return this.vuelosFiltrados.length > 0
      && this.vuelosFiltrados.every(v => this.seleccionados.has(v.idVuelo));
  }

  /** Lotes de carga: vuelos agrupados por fecha (día) de salida, para mapear una
   *  carga masiva y eliminarla completa de un clic. */
  get lotesVuelos(): { fecha: string; total: number; seleccionados: number; ids: number[] }[] {
    const grupos = new Map<string, number[]>();
    this.vuelos.forEach(v => {
      const fecha = (v.horaSalida ?? '').substring(0, 10) || 'sin fecha';
      if (!grupos.has(fecha)) grupos.set(fecha, []);
      grupos.get(fecha)!.push(v.idVuelo);
    });
    return Array.from(grupos.entries())
      .map(([fecha, ids]) => ({
        fecha, total: ids.length,
        seleccionados: ids.filter(id => this.seleccionados.has(id)).length,
        ids
      }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  /** Marca/desmarca todos los vuelos de un lote (por fecha de salida). */
  toggleLote(lote: { ids: number[]; seleccionados: number; total: number }): void {
    if (lote.seleccionados === lote.total) lote.ids.forEach(id => this.seleccionados.delete(id));
    else lote.ids.forEach(id => this.seleccionados.add(id));
  }

  pedirEliminarSeleccionados(): void {
    if (this.seleccionados.size === 0) {
      this.messageService.add({ severity: 'warn', summary: 'Sin selección', detail: 'Marca al menos un vuelo para eliminar.' });
      return;
    }
    this.mostrarConfirmMasivo = true;
  }

  confirmarEliminarMasivo(): void {
    if (this.eliminandoMasivo) return;
    this.eliminandoMasivo = true;
    const ids = Array.from(this.seleccionados);
    this.vueloService.eliminarVuelosMasivo(ids).subscribe({
      next: resp => {
        this.eliminandoMasivo = false;
        this.mostrarConfirmMasivo = false;
        this.seleccionados.clear();
        this.modoSeleccion = false;
        this.messageService.add({
          severity: 'success', summary: 'Eliminación masiva',
          detail: `${resp.data?.eliminados ?? ids.length} vuelo(s) eliminado(s)`
        });
        this.cargarVuelos();
      },
      error: err => {
        this.eliminandoMasivo = false;
        this.messageService.add({
          severity: 'error', summary: 'Error',
          detail: err?.error?.message ?? 'No se pudieron eliminar los vuelos.'
        });
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Muestra una hora en el huso LOCAL del aeropuerto (gmt). El valor viene en UTC
   * (sin zona) desde la BD; se interpreta como UTC y se lleva al huso local del
   * origen/destino para que coincida con la hora del código del vuelo.
   */
  formatearHora(valor?: string, gmt?: number | null): string {
    if (!valor) return '-';

    const limpio = valor.replace(/\.\d+$/, '').substring(0, 19);
    const iso = limpio.length === 16 ? `${limpio}:00Z` : `${limpio}Z`;
    const base = new Date(iso);
    if (Number.isNaN(base.getTime())) return valor;

    const local = new Date(base.getTime() + (gmt ?? 0) * 3_600_000);
    return local.toLocaleString('es-PE', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private toDatetimeLocal(valor: string): string {
    return valor ? valor.substring(0, 16) : '';
  }

  private normalizarLocalDateTime(valor: string): string {
    return valor && valor.length === 16 ? `${valor}:00` : valor;
  }

  /**
   * Convierte una fecha/hora LOCAL de un aeropuerto a UTC (restando su GMT).
   * El CSV de carga trae las horas en el huso local del origen/destino (como pide el
   * enunciado), pero todo el sistema (BD, planificador, mapa) trabaja en UTC: sin esta
   * conversión los vuelos quedan corridos y no se toman en operación diaria.
   */
  private localAUtc(valor: string, gmt: number | undefined | null): string {
    const v = this.normalizarLocalDateTime(valor);
    const d = new Date(v.length === 19 ? `${v}Z` : v); // interpretar como "reloj puro"
    if (Number.isNaN(d.getTime())) return v;
    d.setUTCHours(d.getUTCHours() - (gmt ?? 0));
    return d.toISOString().substring(0, 19);
  }

  private toCsvDateTime(fecha: Date): string {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    const h = String(fecha.getHours()).padStart(2, '0');
    const min = String(fecha.getMinutes()).padStart(2, '0');

    return `${y}-${m}-${d}T${h}:${min}:00`;
  }

  private generarCodigoCSV(numero: number): string {
    const ahora = new Date();
    const y = ahora.getFullYear();
    const m = String(ahora.getMonth() + 1).padStart(2, '0');
    const d = String(ahora.getDate()).padStart(2, '0');
    const h = String(ahora.getHours()).padStart(2, '0');
    const min = String(ahora.getMinutes()).padStart(2, '0');
    const s = String(ahora.getSeconds()).padStart(2, '0');
    const n = String(numero).padStart(2, '0');

    return `VLCSV${y}${m}${d}${h}${min}${s}${n}`;
  }

  onArchivoCSV(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    input.value = '';

    const reader = new FileReader();
    reader.onload = e => this.procesarCSV(e.target?.result as string);
    reader.readAsText(file, 'UTF-8');
  }

  private detectarDelimitador(linea: string): string {
    return (linea.match(/;/g) || []).length > (linea.match(/,/g) || []).length ? ';' : ',';
  }

  private procesarCSV(texto: string): void {
    const lineas = texto
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lineas.length < 2) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Archivo vacío',
        detail: 'El CSV debe tener encabezado y al menos una fila.'
      });
      return;
    }

    const delim = this.detectarDelimitador(lineas[0]);
    const filas = lineas.slice(1);

    this.cargandoCSV = true;
    this.csvProgreso = 30;
    this.csvResultado = null;
    this.cdr.detectChanges();

    const errores: string[] = [];
    const validos: VueloCreateDTO[] = [];

    for (let idx = 0; idx < filas.length; idx++) {
      const numFila = idx + 2;
      const cols = filas[idx]
        .split(delim)
        .map(c => c.trim().replace(/^"|"$/g, ''));

      if (cols.length < 8) {
        errores.push(
          `Fila ${numFila}: formato inválido. Columnas: codigoVuelo, origen, destino, horaSalida, horaLlegada, duracionHoras, capacidadMaxima, esIntercontinental`
        );
        continue;
      }

      const [
        codigoVuelo,
        origenValor,
        destinoValor,
        horaSalida,
        horaLlegada,
        duracionHorasStr,
        capacidadStr,
        esIntercontinentalStr
      ] = cols;

      const origen = this.resolverAeropuerto(origenValor);
      const destino = this.resolverAeropuerto(destinoValor);
      const duracionHoras = Number(duracionHorasStr);
      const capacidadMaxima = parseInt(capacidadStr, 10);
      const esInter = ['true', '1', 'si', 'sí', 'yes']
        .includes((esIntercontinentalStr ?? '').toLowerCase());

      if (!codigoVuelo) {
        errores.push(`Fila ${numFila}: código de vuelo vacío`);
        continue;
      }

      if (!origen) {
        errores.push(`Fila ${numFila}: aeropuerto origen "${origenValor}" no encontrado`);
        continue;
      }

      if (!destino) {
        errores.push(`Fila ${numFila}: aeropuerto destino "${destinoValor}" no encontrado`);
        continue;
      }

      if (origen.idAeropuerto === destino.idAeropuerto) {
        errores.push(`Fila ${numFila}: origen y destino no pueden ser iguales`);
        continue;
      }

      // Husos: el CSV trae horas LOCALES (salida en huso del origen, llegada en huso
      // del destino). Convertir a UTC antes de validar y guardar.
      const salidaUtc  = this.localAUtc(horaSalida,  (origen as any).gmt);
      const llegadaUtc = this.localAUtc(horaLlegada, (destino as any).gmt);

      if (!horaSalida || !horaLlegada || new Date(llegadaUtc) <= new Date(salidaUtc)) {
        errores.push(`Fila ${numFila}: fechas inválidas (llegada UTC debe ser posterior a salida UTC)`);
        continue;
      }

      if (Number.isNaN(duracionHoras) || duracionHoras <= 0) {
        errores.push(`Fila ${numFila}: duración inválida`);
        continue;
      }

      if (Number.isNaN(capacidadMaxima) || capacidadMaxima < 1) {
        errores.push(`Fila ${numFila}: capacidad inválida`);
        continue;
      }

      validos.push({
        codigoVuelo: codigoVuelo.trim().toUpperCase(),
        idAeropuertoOrigen: origen.idAeropuerto,
        idAeropuertoDestino: destino.idAeropuerto,
        horaSalida: salidaUtc,
        horaLlegada: llegadaUtc,
        duracionHoras,
        capacidadMaxima,
        estado: 'PROGRAMADO',
        esIntercontinental: esInter
      });
    }

    if (validos.length === 0) {
      this.cargandoCSV = false;
      this.csvResultado = {
        exitosos: 0,
        fallidos: errores.length,
        errores
      };

      this.cdr.detectChanges();

      this.messageService.add({
        severity: 'error',
        summary: 'Sin registros',
        detail: 'Ninguna fila del CSV pasó la validación.'
      });

      return;
    }

    this.csvProgreso = 60;
    this.cdr.detectChanges();

    // Carga masiva: cada vuelo se crea igual que la creación individual, y toda la tanda
    // comparte una etiqueta para poder eliminarla completa después.
    this.vueloService.cargaMasiva(validos).subscribe({
      next: resp => {
        const creados = resp.data?.creados ?? validos.length;
        this.cargandoCSV = false;
        this.csvProgreso = 100;
        this.csvResultado = {
          exitosos: creados,
          fallidos: errores.length,
          errores
        };
        this.limpiarTodosLosFiltrosSinAplicar();
        this.cdr.detectChanges();

        this.messageService.add({
          severity: errores.length === 0 ? 'success' : 'warn',
          summary: `${creados} vuelos creados`,
          detail: errores.length > 0 ? `${errores.length} fila(s) con error` : 'Todos los vuelos fueron creados correctamente'
        });

        this.cargarVuelos();
        this.cargarTandas();
      },
      error: err => {
        this.cargandoCSV = false;
        this.csvResultado = {
          exitosos: 0,
          fallidos: errores.length + validos.length,
          errores: [...errores, `Servidor: ${err?.error?.message ?? 'error al crear vuelos'}`]
        };
        this.cdr.detectChanges();
        this.messageService.add({
          severity: 'error',
          summary: 'Error del servidor',
          detail: err?.error?.message ?? 'No se pudo registrar la carga masiva.'
        });
      }
    });
  }

  private resolverAeropuerto(valor: string): Aeropuerto | null {
    const limpio = (valor ?? '').trim().toLowerCase();

    if (!limpio) return null;

    const id = Number(limpio);

    if (!Number.isNaN(id)) {
      return this.aeropuertos.find(a => a.idAeropuerto === id) ?? null;
    }

    return this.aeropuertos.find(a =>
      a.codigoOaci?.toLowerCase() === limpio ||
      a.codigo?.toLowerCase() === limpio ||
      a.ciudad?.toLowerCase() === limpio
    ) ?? null;
  }

  descargarPlantillaCSV(): void {
    const origen = this.aeropuertos[0] ?? null;
    const destino = this.aeropuertos.find(
      a => a.idAeropuerto !== origen?.idAeropuerto
    ) ?? null;

    const origenCod = origen?.codigoOaci ?? 'SPIM';
    const destinoCod = destino?.codigoOaci ?? 'SKBO';

    const hoy = new Date();

    const salida1 = new Date(hoy);
    salida1.setHours(8, 0, 0, 0);

    const llegada1 = new Date(salida1);
    llegada1.setHours(salida1.getHours() + 2);

    const salida2 = new Date(hoy);
    salida2.setHours(12, 0, 0, 0);

    const llegada2 = new Date(salida2);
    llegada2.setHours(salida2.getHours() + 3);

    const csv = [
      'codigoVuelo,origen,destino,horaSalida,horaLlegada,duracionHoras,capacidadMaxima,esIntercontinental',
      `${this.generarCodigoCSV(1)},${origenCod},${destinoCod},${this.toCsvDateTime(salida1)},${this.toCsvDateTime(llegada1)},2.00,150,false`,
      `${this.generarCodigoCSV(2)},${origenCod},${destinoCod},${this.toCsvDateTime(salida2)},${this.toCsvDateTime(llegada2)},3.00,200,false`
    ].join('\n');

    const blob = new Blob(['﻿' + csv], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'plantilla-carga-masiva-vuelos.csv';
    a.click();

    URL.revokeObjectURL(url);
  }
}