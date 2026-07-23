import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';
import { EnvioService, EnvioMaletas } from '../../../../../core/services/envio.service';
import { EnvioDiarioService } from '../../../../../core/services/envio-diario.service';
import { AeropuertoService, Aeropuerto } from '../../../../../core/services/aeropuerto.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { PlanVueloService, PlanVueloDiario } from '../../../../../core/services/plan-vuelo.service';
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
  ordenFechaDesc = true;



  //para filtros avanzados
  mostrarFiltrosAvanzados = false;
  continenteOrigenFiltro: string | null = null;
  continenteDestinoFiltro: string | null = null;
  codigoOrigenFiltro: string | null = null;
  codigoDestinoFiltro: string | null = null;
  fechaRegistroDesde: Date | null = null;
  fechaRegistroHasta: Date | null = null;
  continentes: string[] = [];
  idEnvioFiltro: string = '';


  readonly ESTADOS = [
    { label: 'Todos', value: null },
    { label: 'Registrada', value: 'REGISTRADA' },
    { label: 'Por salir', value: 'EN_ESPERA' },
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

  //para mostrar datos de fila de envios ver en que vuelo está yendo
  readonly ESTADOS_CON_VUELO = new Set([
  'EN_ESPERA',
  'EN_TRANSITO',
  'ENTREGADA',
  'RETRASADA'
  ]);
  envioSeleccionado: EnvioMaletas | null = null;
  vueloSeleccionado: PlanVueloDiario | null = null;
  mostrarDetalleVuelo = false;
  cargandoDetalleVuelo = false;

  constructor(
    private readonly envioService: EnvioService,
    private readonly envioDiarioService: EnvioDiarioService,
    private readonly aeropuertoService: AeropuertoService,
    private readonly authService: AuthService,
    private readonly messageService: MessageService,
    private readonly cdr: ChangeDetectorRef,
    private readonly planVueloService: PlanVueloService //agrego para mostrar datos de vuelo en detalle de envío
  ) { }

  ngOnInit(): void {
    this.cargarReferencias();
  }

  private cargarReferencias(): void {
    console.log('[Maleta] Iniciando carga de aeropuertos...');

    this.aeropuertoService.listarAeropuertos().subscribe({
      next: resp => {
        this.aeropuertos = resp.data ?? [];

        console.log('[Maleta] Aeropuertos cargados:', this.aeropuertos.length);
        console.log('[Maleta] Primer aeropuerto:', this.aeropuertos[0]);

        this.continentes = [
          ...new Set(
            this.aeropuertos
              .map(a => a.continente)
              .filter(continente => continente)
          )
        ].sort();

        this.configurarOrigenDesdeUsuario();

        console.log('[Maleta] idOrigen después de configurar usuario:', this.idOrigen);
        
        this.cargarEnvios();

        this.cdr.detectChanges();
      },
      error: err => {
        console.error('[Maleta] Error al cargar aeropuertos:', err);

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

  console.log('[Maleta] Iniciando carga de envíos...');
  console.log('[Maleta] Usuario actual antes de cargar envíos:', this.authService.getCurrentUser());
  console.log('[Maleta] idOrigen actual:', this.idOrigen);

  if (!this.idOrigen) {
    console.warn('[Maleta] No se cargan envíos porque idOrigen no está configurado.');
    this.envios = [];
    this.enviosFiltrados = [];
    this.cargandoLista = false;
    this.cdr.detectChanges();
    return;
  }

  this.envioDiarioService.listarEnviosPorAeropuerto(this.idOrigen).subscribe({
    next: resp => {
      const data = resp.data ?? [];
      const idAeropuertoUsuario = Number(this.idOrigen);

      console.log('[Maleta] Total envíos recibidos del backend:', data.length);
      console.log('[Maleta] ID aeropuerto usuario para filtrar:', idAeropuertoUsuario);
      console.log('[Maleta] Primer envío recibido:', data[0]);
      console.log('[Maleta] Aeropuerto origen primer envío:', data[0]?.aeropuertoOrigen);
      console.log('[Maleta] Aeropuerto destino primer envío:', data[0]?.aeropuertoDestino);

      console.table(
        data.map((envio: any) => ({
          idEnvio: this.obtenerIdEnvio(envio),
          idOrigenDetectado: this.obtenerIdAeropuertoOrigenEnvio(envio),
          codigoOrigen: envio.aeropuertoOrigen?.codigoOaci,
          ciudadOrigen: envio.aeropuertoOrigen?.ciudad,
          idDestinoDetectado: this.obtenerIdAeropuertoDestinoEnvio(envio),
          codigoDestino: envio.aeropuertoDestino?.codigoOaci,
          ciudadDestino: envio.aeropuertoDestino?.ciudad
        }))
      );

      this.envios = this.ordenarEnvios(data as EnvioMaletas[]);

      console.log('[Maleta] Total envíos filtrados por aeropuerto:', this.envios.length);
      console.log('[Maleta] Primer envío filtrado:', this.envios[0]);

      this.aplicarFiltros();
      this.cargandoLista = false;
      this.cdr.detectChanges();
    },
    error: err => {
      console.error('[Maleta] Error al cargar envíos:', err);

      this.cargandoLista = false;
      this.cdr.detectChanges();

      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo cargar la lista de envíos.'
      });
    }
  });
}
  registrarEnvio(): void {
    if (!this.idOrigen) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Origen requerido',
        detail: 'Selecciona el aeropuerto de origen desde donde envías las maletas.'
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
      cantidad: this.cantidad,
      estado: 'REGISTRADA'
    } as any).subscribe({
      next: () => {
        this.enviando = false;
        this.mostrarFormulario = false;
        this.limpiarFormulario();
        this.messageService.add({ severity: 'success', summary: '¡Envío registrado!', detail: 'El envío fue creado correctamente.' });
        this.limpiarTodosLosFiltros();
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

  alternarOrdenFecha(): void {
    this.ordenFechaDesc = !this.ordenFechaDesc;
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

    if (this.idEnvioFiltro.trim()) {
      const idBuscado = this.idEnvioFiltro.trim().replace('#', '').toLowerCase();

      base = base.filter(envio => {
        const idEnvio = String(this.obtenerIdEnvio(envio));
        return idEnvio.includes(idBuscado);
      });
    }

    if (this.continenteOrigenFiltro) {
      base = base.filter(envio => {
        const aeropuertoOrigen = this.buscarAeropuertoCompleto(
          this.obtenerIdAeropuertoOrigen(envio)
        );

        return aeropuertoOrigen?.continente === this.continenteOrigenFiltro;
      });
    }

    if (this.continenteDestinoFiltro) {
      base = base.filter(envio => {
        const aeropuertoDestino = this.buscarAeropuertoCompleto(
          this.obtenerIdAeropuertoDestino(envio)
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

    this.enviosFiltrados = this.ordenarEnvios(base);

    console.log('[Maleta] aplicarFiltros => envios base:', this.envios.length);
    console.log('[Maleta] aplicarFiltros => envios filtrados UI:', this.enviosFiltrados.length);
  }

  //filtrado avanzado
  aplicarFiltrosAvanzados(): void {
    this.aplicarFiltros();
  }

  private buscarAeropuertoCompleto(idAeropuerto?: number | null): Aeropuerto | null {
    if (!idAeropuerto || Number.isNaN(Number(idAeropuerto))) {
      return null;
    }

    return this.aeropuertos.find(
      aeropuerto => Number(aeropuerto.idAeropuerto) === Number(idAeropuerto)
    ) ?? null;
  }


  getEstadoColor(estado: string): string {
    return this.ESTADO_COLORS[estado] ?? '#94a3b8';
  }

  getEstadoLabel(estado: string): string {
  const labels: Record<string, string> = {
    REGISTRADA: 'Registrada',
    EN_ESPERA: 'Por salir',
    EN_TRANSITO: 'En vuelo',
    ENTREGADA: 'Entregada',
    RETRASADA: 'Retrasada'
  };

  return labels[estado] ?? estado;
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
    // Formato esperado: origen,destino,cantidad (OACI, OACI, entero).
    // Compatibilidad: si una fila trae solo 2 columnas se asume "destino,cantidad" y el
    // origen es el aeropuerto seleccionado en el formulario.
    const errores: string[] = [];
    const validos: { idAeropuertoOrigen: number; idAeropuertoDestino: number; cantidad: number }[] = [];
    const origenPorDefecto = this.getAeropuertoById(this.idOrigen);

    for (let idx = 0; idx < filas.length; idx++) {
      const numFila = idx + 2; // +1 por encabezado, +1 por índice 0-based
      const cols = filas[idx].split(delim).map(c => c.trim().replace(/^"|"$/g, ''));

      let codigoOrigen: string | undefined;
      let codigoDestino: string;
      let cantidadStr: string;

      if (cols.length >= 3) {
        [codigoOrigen, codigoDestino, cantidadStr] = cols;
      } else if (cols.length === 2) {
        [codigoDestino, cantidadStr] = cols;
        codigoOrigen = origenPorDefecto?.codigoOaci;
      } else {
        errores.push(`Fila ${numFila}: formato inválido (columnas requeridas: origen, destino, cantidad)`);
        continue;
      }

      const origen = codigoOrigen
        ? this.aeropuertos.find(a => a.codigoOaci.toLowerCase() === codigoOrigen!.toLowerCase())
        : undefined;
      if (!origen) {
        errores.push(`Fila ${numFila}: aeropuerto origen "${codigoOrigen ?? ''}" no encontrado`);
        continue;
      }

      const destino = this.aeropuertos.find(a =>
        a.codigoOaci.toLowerCase() === codigoDestino.toLowerCase());
      if (!destino) {
        errores.push(`Fila ${numFila}: aeropuerto destino "${codigoDestino}" no encontrado`);
        continue;
      }

      const cantidad = parseInt(cantidadStr, 10);
      if (isNaN(cantidad) || cantidad < 1 || cantidad > 400) {
        errores.push(`Fila ${numFila}: cantidad "${cantidadStr}" inválida (debe ser 1–400)`);
        continue;
      }

      if (origen.idAeropuerto === destino.idAeropuerto) {
        errores.push(`Fila ${numFila}: el origen y el destino no pueden ser iguales`);
        continue;
      }

      validos.push({
        idAeropuertoOrigen: origen.idAeropuerto,
        idAeropuertoDestino: destino.idAeropuerto,
        cantidad,
        estado: 'REGISTRADA'
      } as any);
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

    const origenEj = origenUsuario?.codigoOaci ?? this.aeropuertos[0]?.codigoOaci ?? 'ORIG';
    const csv = [
      'origen,destino,cantidad',
      `${origenEj},${destinoEj1},10`,
      `${origenEj},${destinoEj2},15`
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
    this.idEnvioFiltro = '';
    this.aplicarFiltros();
  }
  private configurarOrigenDesdeUsuario(): void {
    const usuario: any = this.authService.getCurrentUser();

    console.log('[Maleta] Usuario actual desde AuthService:', usuario);

    if (!usuario) {
      this.idOrigen = null;

      this.messageService.add({
        severity: 'warn',
        summary: 'Usuario sin datos',
        detail: 'No se encontró información del usuario logueado.'
      });
      return;
    }

    const idAeropuerto = Number(
      usuario.idAeropuerto ??
      usuario.aeropuerto?.idAeropuerto ??
      usuario.aeropuerto?.id ??
      usuario.id_aeropuerto ??
      usuario.aeropuerto_id
    );

    console.log('[Maleta] ID aeropuerto detectado en usuario:', idAeropuerto);

    if (!idAeropuerto || Number.isNaN(idAeropuerto)) {
      this.idOrigen = null;

      this.messageService.add({
        severity: 'warn',
        summary: 'Aeropuerto no asignado',
        detail: 'El usuario no tiene aeropuerto de origen asignado.'
      });
      return;
    }

    this.idOrigen = idAeropuerto;

    const aeropuertoUsuario = this.getAeropuertoById(this.idOrigen);

    console.log('[Maleta] Aeropuerto asignado al usuario:', aeropuertoUsuario);
  }

  private obtenerIdAeropuertoOrigen(envio: any): number {
    return Number(
      envio?.aeropuertoOrigen?.idAeropuerto ??
      envio?.aeropuertoOrigen?.id ??
      envio?.aeropuertoOrigen?.id_aeropuerto ??
      envio?.idAeropuertoOrigen ??
      envio?.id_aeropuerto_origen ??
      envio?.origen?.idAeropuerto ??
      envio?.origen?.id ??
      0
    );
  }

  private obtenerIdAeropuertoDestino(envio: any): number {
    return Number(
      envio?.aeropuertoDestino?.idAeropuerto ??
      envio?.aeropuertoDestino?.id ??
      envio?.aeropuertoDestino?.id_aeropuerto ??
      envio?.idAeropuertoDestino ??
      envio?.id_aeropuerto_destino ??
      envio?.destino?.idAeropuerto ??
      envio?.destino?.id ??
      0
    );
  }

  //metodos para detalle de vuelo en fila de envíos
  puedeVerVuelo(envio: EnvioMaletas): boolean {
    return this.ESTADOS_CON_VUELO.has(envio.estado);
  }

  abrirDetalleVuelo(envio: EnvioMaletas): void {
    if (!this.puedeVerVuelo(envio)) return;

    if (!envio.idPlanVueloAsignado) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Sin vuelo asignado',
        detail: 'Este pedido todavía no tiene un vuelo asociado.'
      });
      return;
    }

    this.envioSeleccionado = envio;
    this.vueloSeleccionado = null;
    this.cargandoDetalleVuelo = true;
    this.mostrarDetalleVuelo = false;

    const idVueloAsignado = envio.idPlanVueloAsignado;

    this.planVueloService.listar().subscribe({
      next: resp => {
        this.vueloSeleccionado =
          (resp.data ?? []).find(v => v.id === idVueloAsignado) ?? null;

        this.cargandoDetalleVuelo = false;

        setTimeout(() => {
          this.mostrarDetalleVuelo = true;
          this.cdr.detectChanges();
        }, 0);
      },
      error: () => {
        this.cargandoDetalleVuelo = false;
        this.mostrarDetalleVuelo = false;
        this.cdr.detectChanges();

        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo cargar el detalle del vuelo.'
        });
      }
    });
  }

  cerrarDetalleVuelo(): void {
    this.mostrarDetalleVuelo = false;
    this.envioSeleccionado = null;
    this.vueloSeleccionado = null;
  }

  getRutaVuelo(vuelo: PlanVueloDiario | null): string {
    if (!vuelo) return '-';
    const origen = vuelo.origen ?? vuelo.codigoOrigen;
    const destino = vuelo.destino ?? vuelo.codigoDestino;
    return `${origen} → ${destino}`;
  }

  formatearHora(valor?: string): string {
    if (!valor) return '-';

    const fecha = new Date(valor);
    if (!Number.isNaN(fecha.getTime())) {
      return fecha.toLocaleTimeString('es-PE', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    return valor.slice(0, 5);
  }

  getMensajeVuelo(): string {
    switch (this.envioSeleccionado?.estado) {
      case 'EN_TRANSITO':
        return 'Este pedido está viajando en este vuelo.';
      case 'ENTREGADA':
        return 'Este pedido fue transportado en este vuelo.';
      case 'RETRASADA':
        return 'Este pedido está retrasado y asociado a este vuelo.';
      default:
        return '';
    }
  }

  getFechaVuelo(envio: EnvioMaletas | null): string {
    const fechaVuelo = envio?.fechaHoraSalidaAsignada ?? envio?.fechaRegistro;

    if (!fechaVuelo) return '-';

    return new Date(fechaVuelo).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  getEstadoVueloAsignado(): string {
    switch (this.envioSeleccionado?.estado) {
      case 'EN_ESPERA':
        return 'POR SALIR';
      case 'EN_TRANSITO':
        return 'EN VUELO';
      case 'ENTREGADA':
        return 'LLEGÓ';
      case 'RETRASADA':
        return 'LLEGÓ CON RETRASO';
      default:
        return this.vueloSeleccionado?.estadoVuelo ?? '-';
    }
  }

  getRutaVueloDetallada(): string {
    const origen = this.envioSeleccionado?.aeropuertoOrigen;
    const destino = this.envioSeleccionado?.aeropuertoDestino;

    if (!origen || !destino) return this.getRutaVuelo(this.vueloSeleccionado);

    return `${origen.ciudad} (${origen.pais}) → ${destino.ciudad} (${destino.pais})`;
  }

  getTipoVueloCorto(): string {
    const origen = this.envioSeleccionado?.aeropuertoOrigen;
    const destino = this.envioSeleccionado?.aeropuertoDestino;

    if (!origen || !destino) return 'Vuelo';

    const origenCompleto = this.buscarAeropuertoCompleto(origen.idAeropuerto);
    const destinoCompleto = this.buscarAeropuertoCompleto(destino.idAeropuerto);

    if (origen.pais === destino.pais) return 'Vuelo nacional';

    if (origenCompleto?.continente === destinoCompleto?.continente) {
      return 'Vuelo internacional';
    }

    return 'Vuelo intercontinental';
  }

  getRutaContinentes(): string {
    const origen = this.envioSeleccionado?.aeropuertoOrigen;
    const destino = this.envioSeleccionado?.aeropuertoDestino;

    if (!origen || !destino) return '';

    const origenCompleto = this.buscarAeropuertoCompleto(origen.idAeropuerto);
    const destinoCompleto = this.buscarAeropuertoCompleto(destino.idAeropuerto);

    return `${origenCompleto?.continente ?? '-'} → ${destinoCompleto?.continente ?? '-'}`;
  }


  private obtenerIdAeropuertoOrigenEnvio(envio: any): number {
  return Number(
    envio.aeropuertoOrigen?.idAeropuerto ??
    envio.aeropuertoOrigen?.id ??
    envio.idAeropuertoOrigen ??
    envio.id_aeropuerto_origen ??
    0
  );
}

private obtenerIdAeropuertoDestinoEnvio(envio: any): number {
  return Number(
    envio.aeropuertoDestino?.idAeropuerto ??
    envio.aeropuertoDestino?.id ??
    envio.idAeropuertoDestino ??
    envio.id_aeropuerto_destino ??
    0
  );
}
  private ordenarEnvios(envios: EnvioMaletas[]): EnvioMaletas[] {
    return [...envios].sort((a, b) => {
      const fechaA = this.obtenerTiempoFecha(a.fechaRegistro);
      const fechaB = this.obtenerTiempoFecha(b.fechaRegistro);

      if (fechaA !== fechaB) {
        return this.ordenFechaDesc
          ? fechaB - fechaA
          : fechaA - fechaB;
      }

      const idA = this.obtenerIdEnvio(a);
      const idB = this.obtenerIdEnvio(b);

      return this.ordenFechaDesc
        ? idB - idA
        : idA - idB;
    });
  }

  private obtenerIdEnvio(envio: any): number {
    return Number(
      envio.idEnvioDiario ??
      envio.idEnvioMaletas ??
      envio.idEnvio ??
      envio.idUbicacionEnvio ??
      envio.id ??
      0
    );
  }

  private obtenerTiempoFecha(valor: any): number {
    if (!valor) return 0;

    if (valor instanceof Date) {
      return valor.getTime();
    }

    if (Array.isArray(valor)) {
      const [year, month, day, hour = 0, minute = 0, second = 0] = valor;
      return new Date(year, month - 1, day, hour, minute, second).getTime();
    }

    if (typeof valor === 'string') {
      const fechaDirecta = new Date(valor);

      if (!Number.isNaN(fechaDirecta.getTime())) {
        return fechaDirecta.getTime();
      }

      const match = valor.match(/^(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{2}):(\d{2})$/);

      if (match) {
        const [, dd, mm, yy, hh, min] = match;
        const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);

        return new Date(
          year,
          Number(mm) - 1,
          Number(dd),
          Number(hh),
          Number(min),
          0
        ).getTime();
      }
    }

    return 0;
  }

  private limpiarTodosLosFiltros(): void {
    this.estadoFiltro = null;
    this.textoBusqueda = '';
    this.idEnvioFiltro = '';
    this.continenteOrigenFiltro = null;
    this.continenteDestinoFiltro = null;
    this.codigoOrigenFiltro = null;
    this.codigoDestinoFiltro = null;
    this.fechaRegistroDesde = null;
    this.fechaRegistroHasta = null;
  }

}
