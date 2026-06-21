import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';
import { EnvioService, EnvioMaletas } from '../../../../../core/services/envio.service';
import { EnvioDiarioService } from '../../../../../core/services/envio-diario.service';
import { AeropuertoService, Aeropuerto } from '../../../../../core/services/aeropuerto.service';
import { AuthService } from '../../../../../core/services/auth.service';
@Component({
  selector: 'app-maleta',
  standalone: false,
  templateUrl: './maleta.component.html',
  styleUrl: './maleta.component.css'
})
export class MaletaComponent implements OnInit {

  // ── Formulario ─────────────────────────────────────────────
  idOrigen: number | null = null;
  idDestino: number | null = null;
  cantidad: number = 1;

  // ── Opciones select ────────────────────────────────────────
  aeropuertos: Aeropuerto[] = [];

  // ── Estado UI ──────────────────────────────────────────────
  cargandoForm = false;
  cargandoLista = true;
  enviando = false;
  mostrarFormulario = false;

  // ── Lista de envíos ────────────────────────────────────────
  envios: EnvioMaletas[] = [];
  enviosFiltrados: EnvioMaletas[] = [];
  estadoFiltro: string | null = null;
  textoBusqueda = '';
  mostrarFiltrosAvanzados = false;

  continenteOrigenFiltro: string | null = null;
  continenteDestinoFiltro: string | null = null;
  codigoOrigenFiltro: string | null = null;
  codigoDestinoFiltro: string | null = null;
  fechaRegistroDesde: Date | null = null;
  fechaRegistroHasta: Date | null = null;
  continentes: string[] = [];

  

  readonly ESTADOS = [
    { label: 'Todos', value: null },
    { label: 'Registrada', value: 'REGISTRADA' },
    { label: 'En Tránsito', value: 'EN_TRANSITO' },
    { label: 'Entregada', value: 'ENTREGADA' },
    { label: 'Retrasada', value: 'RETRASADA' }
  ];

  readonly ESTADO_COLORS: Record<string, string> = {
    REGISTRADA: '#60a5fa',
    EN_TRANSITO: '#f59e0b',
    ENTREGADA: '#4ade80',
    RETRASADA: '#f87171',
    EN_ESPERA: '#a78bfa'
  };

  constructor(
    private readonly envioService: EnvioService,
    private readonly envioDiarioService: EnvioDiarioService,
    private readonly aeropuertoService: AeropuertoService,
    private readonly authService: AuthService,
    private readonly messageService: MessageService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.cargarReferencias();
    this.cargarEnvios();
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
        this.configurarOrigenDesdeUsuario();
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

  cargarEnvios(): void {
    this.cargandoLista = true;
    this.envioDiarioService.listarEnvios().subscribe({
      next: resp => {
        this.envios = resp.data ?? [];
        this.aplicarFiltros();
        this.cargandoLista = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargandoLista = false;
        this.cdr.detectChanges();
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la lista de envíos.' });
      }
    });
  }

  registrarEnvio(): void {
    if (!this.idOrigen) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Origen no asignado',
        detail: 'Tu usuario no tiene aeropuerto de origen asignado.'
      });
      return;
    }

    if (!this.idDestino || this.cantidad < 1) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Campos requeridos',
        detail: 'Selecciona aeropuerto de destino e ingresa la cantidad de maletas.'
      });
      return;
    }
    if (this.idOrigen === this.idDestino) {
      this.messageService.add({ severity: 'warn', summary: 'Ruta inválida', detail: 'El aeropuerto de origen y destino no pueden ser iguales.' });
      return;
    }
    this.enviando = true;
    this.envioDiarioService.crearEnvio({
      idAeropuertoOrigen: this.idOrigen,
      idAeropuertoDestino: this.idDestino,
      cantidad: this.cantidad
    }).subscribe({
      next: () => {
        this.enviando = false;
        this.mostrarFormulario = false;
        this.limpiarFormulario();
        this.messageService.add({ severity: 'success', summary: '¡Envío registrado!', detail: 'El envío fue creado correctamente.' });
        this.cargarEnvios();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.enviando = false;
        this.cdr.detectChanges();
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message ?? 'No se pudo registrar el envío.' });
      }
    });
  }

  limpiarFormulario(): void {
    this.idDestino = null;
    this.cantidad = 1;
  }

  filtrarPorEstado(estado: string | null): void {
    this.estadoFiltro = estado;
    this.aplicarFiltros();
  }

  onBuscar(event: Event): void {
    this.textoBusqueda = (event.target as HTMLInputElement).value.toLowerCase();
    this.aplicarFiltros();
  }

  private aplicarFiltros(): void {
    let base = this.estadoFiltro
      ? this.envios.filter(e => e.estado === this.estadoFiltro)
      : [...this.envios];

    if (this.textoBusqueda) {
      base = base.filter(e =>
        (e.aeropuertoOrigen?.codigoOaci ?? '').toLowerCase().includes(this.textoBusqueda) ||
        (e.aeropuertoOrigen?.ciudad ?? '').toLowerCase().includes(this.textoBusqueda) ||
        (e.aeropuertoDestino?.codigoOaci ?? '').toLowerCase().includes(this.textoBusqueda) ||
        (e.aeropuertoDestino?.ciudad ?? '').toLowerCase().includes(this.textoBusqueda)
      );
    }
    if (this.continenteOrigenFiltro) {
      base = base.filter(envio => {
        const aeropuertoOrigen = this.buscarAeropuertoCompleto(
          envio.aeropuertoOrigen?.idAeropuerto
        );

        return aeropuertoOrigen?.continente === this.continenteOrigenFiltro;
      });
    }
    if (this.continenteDestinoFiltro) {
      base = base.filter(envio => {
        const aeropuertoDestino = this.buscarAeropuertoCompleto(
          envio.aeropuertoDestino?.idAeropuerto
        );

        return aeropuertoDestino?.continente === this.continenteDestinoFiltro;
      });
    }
    if (this.codigoOrigenFiltro) {
      base = base.filter(envio =>
        envio.aeropuertoOrigen?.codigoOaci === this.codigoOrigenFiltro
      );
    }

    if (this.codigoDestinoFiltro) {
      base = base.filter(envio =>
        envio.aeropuertoDestino?.codigoOaci === this.codigoDestinoFiltro
      );
    }


    if (this.fechaRegistroDesde) {
      const desde = new Date(this.fechaRegistroDesde);
      desde.setHours(0, 0, 0, 0);

      base = base.filter(envio => {
        const fechaEnvio = new Date(envio.fechaRegistro);
        return fechaEnvio >= desde;
      });
    }

    if (this.fechaRegistroHasta) {
      const hasta = new Date(this.fechaRegistroHasta);
      hasta.setHours(23, 59, 59, 999);

      base = base.filter(envio => {
        const fechaEnvio = new Date(envio.fechaRegistro);
        return fechaEnvio <= hasta;
      });
    }
    this.enviosFiltrados = base;
  }

  //filtrado avanzado
  aplicarFiltrosAvanzados(): void {
    this.aplicarFiltros();
  }

  private buscarAeropuertoCompleto(idAeropuerto?: number): Aeropuerto | null {
    if (!idAeropuerto) {
      return null;
    }

    return this.aeropuertos.find(
      aeropuerto => aeropuerto.idAeropuerto === idAeropuerto
    ) ?? null;
  }


  getEstadoColor(estado: string): string {
    return this.ESTADO_COLORS[estado] ?? '#94a3b8';
  }

  getOrigenNombre(origen: Aeropuerto): string {
    return `${origen.codigoOaci} – ${origen.ciudad}`;
  }

  getTotalMaletas(): number {
    return this.enviosFiltrados.reduce((s, e) => s + e.cantidad, 0);
  }

  /** Returns the selected aeropuerto object by id, or null. Used in template. */
  getAeropuertoById(id: number | null): Aeropuerto | null {
    if (id === null) return null;
    return this.aeropuertos.find(a => a.idAeropuerto === id) ?? null;
  }

  /** Returns delivery days: 1 if same continent, 2 if different. Null if not both selected. */
  getDeliveryTime(): number | null {
    const o = this.getAeropuertoById(this.idOrigen);
    const d = this.getAeropuertoById(this.idDestino);
    if (!o || !d) return null;
    return o.continente === d.continente ? 1 : 2;
  }

  /** True if origin and destination are on the same continent. */
  isSameContinente(): boolean {
    const o = this.getAeropuertoById(this.idOrigen);
    const d = this.getAeropuertoById(this.idDestino);
    if (!o || !d) return false;
    return o.continente === d.continente;
  }

  getFlightType(): string {
    return this.isSameContinente() ? 'Intracontinental' : 'Intercontinental';
  }

  // ── CARGA MASIVA CSV ────────────────────────────────────────

  cargandoCSV = false;
  csvProgreso = 0;
  csvResultado: { exitosos: number; fallidos: number; errores: string[] } | null = null;

  /** Disparado al seleccionar archivo en el input oculto */
  onArchivoCSV(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = ''; // permite volver a subir el mismo archivo
    const reader = new FileReader();
    reader.onload = (e) => this.procesarCSV(e.target?.result as string);
    reader.readAsText(file, 'UTF-8');
  }

  private detectarDelimitador(linea: string): string {
    return (linea.match(/;/g) || []).length > (linea.match(/,/g) || []).length ? ';' : ',';
  }

  /**
   * Valida todas las filas localmente y registra los envíos válidos
   * en UNA sola petición (POST /batch) en vez de una petición por fila.
   */
  private procesarCSV(texto: string): void {
    const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lineas.length < 2) {
      this.messageService.add({
        severity: 'warn', summary: 'Archivo vacío',
        detail: 'El CSV debe tener encabezado y al menos una fila de datos.'
      });
      return;
    }

    const delim = this.detectarDelimitador(lineas[0]);
    const filas = lineas.slice(1); // omitir encabezado
    this.cargandoCSV = true;
    this.csvProgreso = 30; // validación local
    this.csvResultado = null;
    this.cdr.detectChanges();


    // ── 1. Validación local de todas las filas ──
    const errores: string[] = [];
    const validos: { idAeropuertoOrigen: number; idAeropuertoDestino: number; cantidad: number }[] = [];

    if (!this.idOrigen) {
      this.cargandoCSV = false;
      this.messageService.add({
        severity: 'warn',
        summary: 'Origen no asignado',
        detail: 'Tu usuario no tiene aeropuerto de origen asignado.'
      });
      this.cdr.detectChanges();
      return;
    }

    const origen = this.getAeropuertoById(this.idOrigen);

    if (!origen) {
      this.cargandoCSV = false;
      this.messageService.add({
        severity: 'warn',
        summary: 'Origen inválido',
        detail: 'No se encontró el aeropuerto de origen del usuario.'
      });
      this.cdr.detectChanges();
      return;
    }

    for (let idx = 0; idx < filas.length; idx++) {
      const numFila = idx + 2; // +1 por encabezado, +1 por índice 0-based
      const cols = filas[idx].split(delim).map(c => c.trim().replace(/^"|"$/g, ''));

      if (cols.length < 2) {
        errores.push(`Fila ${numFila}: formato inválido (2 columnas requeridas: destino, cantidad)`);
        continue;
      }

      const [codigoDestino, cantidadStr] = cols;
      const cantidad = parseInt(cantidadStr, 10);

      const destino = this.aeropuertos.find(a =>
        a.codigoOaci.toLowerCase() === codigoDestino.toLowerCase());

      if (!destino) {
        errores.push(`Fila ${numFila}: aeropuerto destino "${codigoDestino}" no encontrado`);
        continue;
      }

      if (isNaN(cantidad) || cantidad < 1 || cantidad > 400) {
        errores.push(`Fila ${numFila}: cantidad "${cantidadStr}" inválida (debe ser 1–400)`);
        continue;
      }

      if (origen.idAeropuerto === destino.idAeropuerto) {
        errores.push(`Fila ${numFila}: el destino no puede ser igual al aeropuerto de origen del usuario`);
        continue;
      }

      validos.push({
        idAeropuertoOrigen: origen.idAeropuerto,
        idAeropuertoDestino: destino.idAeropuerto,
        cantidad
      });
    }

    if (validos.length === 0) {
      this.cargandoCSV = false;
      this.csvResultado = { exitosos: 0, fallidos: errores.length, errores };
      this.cdr.detectChanges();
      this.messageService.add({
        severity: 'error', summary: 'Sin registros',
        detail: 'Ninguna fila del CSV pasó la validación.'
      });
      return;
    }

    // ── 2. Una sola petición batch al backend ──
    this.csvProgreso = 60;
    this.cdr.detectChanges();

    forkJoin(
      validos.map(envio => this.envioDiarioService.crearEnvio(envio))
    ).subscribe({
      next: (respuestas) => {
        const creados = respuestas.length;

        this.cargandoCSV = false;
        this.csvProgreso = 100;
        this.csvResultado = { exitosos: creados, fallidos: errores.length, errores };
        this.cdr.detectChanges();

        this.messageService.add({
          severity: errores.length === 0 ? 'success' : 'warn',
          summary: `${creados} envío(s) registrado(s)`,
          detail: errores.length > 0
            ? `${errores.length} fila(s) con error de validación`
            : 'Todos los envíos fueron creados correctamente'
        });

        this.cargarEnvios();
      },
      error: (err) => {
        this.cargandoCSV = false;
        this.csvResultado = {
          exitosos: 0,
          fallidos: errores.length + validos.length,
          errores: [...errores, `Servidor: ${err?.error?.message ?? 'error al crear los envíos'}`]
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

  /** Descarga una plantilla CSV con datos de ejemplo del sistema */
  descargarPlantillaCSV(): void {
    const origenUsuario = this.getAeropuertoById(this.idOrigen);
    const destinos = this.aeropuertos.filter(a => a.idAeropuerto !== this.idOrigen);

    const destinoEj1 = destinos[0]?.codigoOaci ?? 'DEST';
    const destinoEj2 = destinos[1]?.codigoOaci ?? 'DEST2';

    const csv = [
      'destino,cantidad',
      `${destinoEj1},10`,
      `${destinoEj2},15`
    ].join('\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plantilla-carga-masiva-${origenUsuario?.codigoOaci ?? 'origen'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  //limpiar filtros
  limpiarFiltrosAvanzados(): void {
    this.continenteOrigenFiltro = null;
    this.continenteDestinoFiltro = null;
    this.codigoOrigenFiltro = null;
    this.codigoDestinoFiltro = null;
    this.fechaRegistroDesde = null;
    this.fechaRegistroHasta = null;
    this.aplicarFiltros();
  }
  private configurarOrigenDesdeUsuario(): void {
    const usuario = this.authService.getCurrentUser();

    if (!usuario) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Usuario sin datos',
        detail: 'No se encontró información del usuario logueado.'
      });
      return;
    }

    if (!usuario.idAeropuerto) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Aeropuerto no asignado',
        detail: 'El usuario no tiene aeropuerto de origen asignado.'
      });
      return;
    }

    this.idOrigen = Number(usuario.idAeropuerto);
  }
}
