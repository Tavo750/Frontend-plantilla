import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { MessageService } from 'primeng/api';
import { EnvioService, EnvioMaletas } from '../../../../../core/services/envio.service';
import { AeropuertoService, Aeropuerto } from '../../../../../core/services/aeropuerto.service';

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
    private readonly aeropuertoService: AeropuertoService,
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
        this.cdr.detectChanges();
      }
    });
  }

  cargarEnvios(): void {
    this.cargandoLista = true;
    this.envioService.listarEnvios().subscribe({
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
    if (!this.idOrigen || !this.idDestino || this.cantidad < 1) {
      this.messageService.add({ severity: 'warn', summary: 'Campos requeridos', detail: 'Completa todos los campos del formulario.' });
      return;
    }
    if (this.idOrigen === this.idDestino) {
      this.messageService.add({ severity: 'warn', summary: 'Ruta inválida', detail: 'El aeropuerto de origen y destino no pueden ser iguales.' });
      return;
    }
    this.enviando = true;
    this.envioService.crearEnvio({
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
    this.idOrigen = null;
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
    this.enviosFiltrados = base;
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

  private async procesarCSV(texto: string): Promise<void> {
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
    this.csvProgreso = 0;
    this.csvResultado = null;
    this.cdr.detectChanges();

    let exitosos = 0, fallidos = 0;
    const errores: string[] = [];

    for (let idx = 0; idx < filas.length; idx++) {
      const cols = filas[idx].split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 3) {
        fallidos++;
        errores.push(`Fila ${idx + 2}: formato inválido (3 columnas requeridas: origen, destino, cantidad)`);
        this.csvProgreso = Math.round(((idx + 1) / filas.length) * 100);
        this.cdr.detectChanges();
        continue;
      }

      const [codigoOrigen, codigoDestino, cantidadStr] = cols;
      const cantidad = parseInt(cantidadStr, 10);

      const origen = this.aeropuertos.find(a =>
        a.codigoOaci.toLowerCase() === codigoOrigen.toLowerCase()
      );
      if (!origen) {
        fallidos++;
        errores.push(`Fila ${idx + 2}: aeropuerto origen "${codigoOrigen}" no encontrado`);
        this.csvProgreso = Math.round(((idx + 1) / filas.length) * 100);
        this.cdr.detectChanges();
        continue;
      }

      const destino = this.aeropuertos.find(a =>
        a.codigoOaci.toLowerCase() === codigoDestino.toLowerCase()
      );
      if (!destino) {
        fallidos++;
        errores.push(`Fila ${idx + 2}: aeropuerto destino "${codigoDestino}" no encontrado`);
        this.csvProgreso = Math.round(((idx + 1) / filas.length) * 100);
        this.cdr.detectChanges();
        continue;
      }

      if (isNaN(cantidad) || cantidad < 1 || cantidad > 400) {
        fallidos++;
        errores.push(`Fila ${idx + 2}: cantidad "${cantidadStr}" inválida (debe ser 1–400)`);
        this.csvProgreso = Math.round(((idx + 1) / filas.length) * 100);
        this.cdr.detectChanges();
        continue;
      }

      if (origen.idAeropuerto === destino.idAeropuerto) {
        fallidos++;
        errores.push(`Fila ${idx + 2}: origen y destino son el mismo aeropuerto`);
        this.csvProgreso = Math.round(((idx + 1) / filas.length) * 100);
        this.cdr.detectChanges();
        continue;
      }

      await new Promise<void>(resolve => {
        this.envioService.crearEnvio({
          idAeropuertoOrigen: origen.idAeropuerto,
          idAeropuertoDestino: destino.idAeropuerto,
          cantidad
        }).subscribe({
          next: () => { exitosos++; resolve(); },
          error: () => {
            fallidos++;
            errores.push(`Fila ${idx + 2}: error del servidor al crear envío`);
            resolve();
          }
        });
      });

      this.csvProgreso = Math.round(((idx + 1) / filas.length) * 100);
      this.cdr.detectChanges();
    }

    this.cargandoCSV = false;
    this.csvResultado = { exitosos, fallidos, errores };
    this.cdr.detectChanges();

    if (exitosos > 0) {
      this.messageService.add({
        severity: fallidos === 0 ? 'success' : 'warn',
        summary: `${exitosos} envío(s) registrado(s)`,
        detail: fallidos > 0 ? `${fallidos} fila(s) con error` : 'Todos los envíos fueron creados correctamente'
      });
      this.cargarEnvios();
    } else {
      this.messageService.add({
        severity: 'error', summary: 'Sin registros',
        detail: 'No se pudo registrar ningún envío del archivo CSV.'
      });
    }
  }

  /** Descarga una plantilla CSV con datos de ejemplo del sistema */
  descargarPlantillaCSV(): void {
    const origenEj  = this.aeropuertos[0]?.codigoOaci ?? 'ORIG';
    const destinoEj = this.aeropuertos[1]?.codigoOaci ?? 'DEST';
    const csv = [
      'origen,destino,cantidad',
      `${origenEj},${destinoEj},10`,
      `${destinoEj},${origenEj},15`
    ].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-carga-masiva.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}
