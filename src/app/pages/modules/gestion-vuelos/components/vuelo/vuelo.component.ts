import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';

import { AeropuertoService, Aeropuerto } from '../../../../../core/services/aeropuerto.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { VueloService, Vuelo, VueloCreateDTO, EstadoVuelo } from '../../../../../core/services/vuelo.service';

@Component({
  selector: 'app-vuelo',
  standalone: false,
  templateUrl: './vuelo.component.html',
  styleUrl: './vuelo.component.css'
})
export class VueloComponent implements OnInit {

  idAeropuertoUsuario: number | null = null;

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
    private readonly authService: AuthService,
    private readonly messageService: MessageService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.configurarAeropuertoDesdeUsuario();
    this.cargarReferencias();
    this.cargarVuelos();
  }

  private configurarAeropuertoDesdeUsuario(): void {
    const usuario = this.authService.getCurrentUser();

    if (!usuario?.idAeropuerto) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Aeropuerto no asignado',
        detail: 'El usuario logueado no tiene aeropuerto asignado.'
      });
      return;
    }

    this.idAeropuertoUsuario = Number(usuario.idAeropuerto);
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
    if (!this.idAeropuertoUsuario) {
      this.cargandoLista = false;
      return;
    }

    this.cargandoLista = true;

    this.vueloService.listarPorOrigen(this.idAeropuertoUsuario).subscribe({
      next: (resp) => {
        this.vuelos = this.ordenarVuelos(resp.data || []);
        this.aplicarFiltros();
        this.cargandoLista = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
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
    if (!this.idAeropuertoUsuario) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Aeropuerto no asignado',
        detail: 'Tu usuario no tiene aeropuerto asignado.'
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

    if (this.idAeropuertoUsuario === this.idAeropuertoDestino) {
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
      idAeropuertoOrigen: Number(this.idAeropuertoUsuario),
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

  getAeropuertoUsuario(): Aeropuerto | null {
    return this.getAeropuertoById(this.idAeropuertoUsuario);
  }

  private buscarAeropuertoCompleto(idAeropuerto?: number): Aeropuerto | null {
    if (!idAeropuerto) return null;
    return this.aeropuertos.find(a => a.idAeropuerto === idAeropuerto) ?? null;
  }

  getRutaPreview(): string {
    const o = this.getAeropuertoById(this.idAeropuertoUsuario);
    const d = this.getAeropuertoById(this.idAeropuertoDestino);

    return !o || !d
      ? 'Seleccione destino'
      : `${o.ciudad} (${o.codigoOaci}) → ${d.ciudad} (${d.codigoOaci})`;
  }

  getTipoVueloPreview(): string {
    const o = this.getAeropuertoById(this.idAeropuertoUsuario);
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

  formatearHora(valor?: string): string {
    if (!valor) return '-';

    const f = new Date(valor);

    return !Number.isNaN(f.getTime())
      ? f.toLocaleString('es-PE', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      : valor;
  }

  private toDatetimeLocal(valor: string): string {
    return valor ? valor.substring(0, 16) : '';
  }

  private normalizarLocalDateTime(valor: string): string {
    return valor && valor.length === 16 ? `${valor}:00` : valor;
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
    const origenUsuario = this.getAeropuertoById(this.idAeropuertoUsuario);

    if (!origenUsuario) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Aeropuerto no asignado',
        detail: 'No se encontró el aeropuerto del usuario.'
      });
      return;
    }

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

      if (cols.length < 7) {
        errores.push(`Fila ${numFila}: formato inválido. Columnas: codigoVuelo, destino, horaSalida, horaLlegada, duracionHoras, capacidadMaxima, esIntercontinental`);
        continue;
      }

      const [
        codigoVuelo,
        destinoValor,
        horaSalida,
        horaLlegada,
        duracionHorasStr,
        capacidadStr,
        esIntercontinentalStr
      ] = cols;

      const destino = this.resolverAeropuerto(destinoValor);
      const duracionHoras = Number(duracionHorasStr);
      const capacidadMaxima = parseInt(capacidadStr, 10);
      const esInter = ['true', '1', 'si', 'sí', 'yes'].includes((esIntercontinentalStr ?? '').toLowerCase());

      if (!codigoVuelo) {
        errores.push(`Fila ${numFila}: código de vuelo vacío`);
        continue;
      }

      if (!destino) {
        errores.push(`Fila ${numFila}: aeropuerto destino "${destinoValor}" no encontrado`);
        continue;
      }

      if (origenUsuario.idAeropuerto === destino.idAeropuerto) {
        errores.push(`Fila ${numFila}: destino no puede ser igual al aeropuerto del usuario`);
        continue;
      }

      if (!horaSalida || !horaLlegada || new Date(horaLlegada) <= new Date(horaSalida)) {
        errores.push(`Fila ${numFila}: fechas inválidas`);
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
        idAeropuertoOrigen: origenUsuario.idAeropuerto,
        idAeropuertoDestino: destino.idAeropuerto,
        horaSalida: this.normalizarLocalDateTime(horaSalida),
        horaLlegada: this.normalizarLocalDateTime(horaLlegada),
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

    forkJoin(validos.map(vuelo => this.vueloService.crearVuelo(vuelo))).subscribe({
      next: respuestas => {
        const creados = respuestas.length;

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
          summary: `${creados} vuelo(s) registrado(s)`,
          detail: errores.length > 0
            ? `${errores.length} fila(s) con error`
            : 'Todos los vuelos fueron creados correctamente'
        });

        this.cargarVuelos();
      },
      error: err => {
        this.cargandoCSV = false;
        this.csvResultado = {
          exitosos: 0,
          fallidos: errores.length + validos.length,
          errores: [
            ...errores,
            `Servidor: ${err?.error?.message ?? 'error al crear vuelos'}`
          ]
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
    const origenUsuario = this.getAeropuertoById(this.idAeropuertoUsuario);
    const destino = this.aeropuertos.find(a => a.idAeropuerto !== this.idAeropuertoUsuario);
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
      'codigoVuelo,destino,horaSalida,horaLlegada,duracionHoras,capacidadMaxima,esIntercontinental',
      `${this.generarCodigoCSV(1)},${destinoCod},${this.toCsvDateTime(salida1)},${this.toCsvDateTime(llegada1)},2.00,150,false`,
      `${this.generarCodigoCSV(2)},${destinoCod},${this.toCsvDateTime(salida2)},${this.toCsvDateTime(llegada2)},3.00,200,false`
    ].join('\n');

    const blob = new Blob(['﻿' + csv], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `plantilla-carga-masiva-vuelos-${origenUsuario?.codigoOaci ?? 'origen'}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }
}