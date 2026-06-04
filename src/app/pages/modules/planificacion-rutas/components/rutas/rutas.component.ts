import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { MessageService } from 'primeng/api';

import {
  EnvioService,
  EnvioMaletas
} from '../../../../../core/services/envio.service';

import {
  AeropuertoService,
  Aeropuerto
} from '../../../../../core/services/aeropuerto.service';

@Component({
  selector: 'app-rutas',
  standalone: false,
  templateUrl: './rutas.component.html',
  styleUrl: './rutas.component.css'
})
export class RutasComponent implements OnInit {

  envios: EnvioMaletas[] = [];
  aeropuertos: Aeropuerto[] = [];
  continentes: string[] = [];

  envioSeleccionado: EnvioMaletas | null = null;
  enviosSeleccionados: EnvioMaletas[] = [];

  cargando = false;
  error = false;

  constructor(
    private readonly envioService: EnvioService,
    private readonly aeropuertoService: AeropuertoService,
    private readonly messageService: MessageService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos(): void {
    this.cargarEnvios();
    this.cargarAeropuertos();
  }

  cargarEnvios(): void {
    this.cargando = true;
    this.error = false;

    this.envioService.listarEnvios().subscribe({
      next: (response) => {
        this.envios = response.data ?? [];
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
        this.error = true;
        this.cdr.detectChanges();

        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo cargar la lista de envíos'
        });
      }
    });
  }

  cargarAeropuertos(): void {
    this.aeropuertoService.listarAeropuertos().subscribe({
      next: (response) => {
        this.aeropuertos = response.data ?? [];

        this.continentes = [
          ...new Set(this.aeropuertos.map(a => a.continente))
        ].sort();

        this.cdr.detectChanges();
      },
      error: () => {
        this.messageService.add({
          severity: 'warn',
          summary: 'Advertencia',
          detail: 'No se pudieron cargar los aeropuertos'
        });
      }
    });
  }

  agregarEnvioSeleccionado(): void {
    if (!this.envioSeleccionado) return;

    const existe = this.enviosSeleccionados.some(
      env => env.idEnvio === this.envioSeleccionado?.idEnvio
    );

    if (!existe) {
      this.enviosSeleccionados = [
        ...this.enviosSeleccionados,
        this.envioSeleccionado
      ];
    }

    this.envioSeleccionado = null;
  }

  eliminarEnvio(idEnvio: number): void {
    this.enviosSeleccionados = this.enviosSeleccionados.filter(
      env => env.idEnvio !== idEnvio
    );
  }

  getEstadoClass(estado: string): string {
    const mapa: Record<string, string> = {
      REGISTRADA: 'badge-registrada',
      EN_TRANSITO: 'badge-transito',
      ENTREGADA: 'badge-entregada',
      RETRASADA: 'badge-retrasada',
      EN_ESPERA: 'badge-espera'
    };

    return mapa[estado] ?? 'badge-default';
  }

  getTotalMaletas(): number {
    return this.enviosSeleccionados.reduce(
      (sum, env) => sum + env.cantidad,
      0
    );
  }

  getTotalEnvios(): number {
    return this.enviosSeleccionados.length;
  }

  getRutasNacionales(): number {
    return this.enviosSeleccionados.filter(
      env => env.aeropuertoOrigen?.pais === env.aeropuertoDestino?.pais
    ).length;
  }

  getRutasInternacionales(): number {
    return this.enviosSeleccionados.filter(
      env => env.aeropuertoOrigen?.pais !== env.aeropuertoDestino?.pais
    ).length;
  }

  getRutasMismoContinente(): number {
    return this.enviosSeleccionados.filter(env => {
      const origen = this.obtenerAeropuertoPorCodigo(
        env.aeropuertoOrigen?.codigoOaci ?? ''
      );

      const destino = this.obtenerAeropuertoPorCodigo(
        env.aeropuertoDestino?.codigoOaci ?? ''
      );

      return origen?.continente === destino?.continente;
    }).length;
  }

  getRutasDistintoContinente(): number {
    return this.enviosSeleccionados.filter(env => {
      const origen = this.obtenerAeropuertoPorCodigo(
        env.aeropuertoOrigen?.codigoOaci ?? ''
      );

      const destino = this.obtenerAeropuertoPorCodigo(
        env.aeropuertoDestino?.codigoOaci ?? ''
      );

      return origen?.continente !== destino?.continente;
    }).length;
  }

  obtenerAeropuertoPorCodigo(codigoOaci: string): Aeropuerto | undefined {
    return this.aeropuertos.find(
      a => a.codigoOaci === codigoOaci
    );
  }

  trackByEnvio(index: number, envio: EnvioMaletas): number {
    return envio.idEnvio;
  }

  getPaisAeropuerto(codigoOaci?: string): string {
  if (!codigoOaci) return '—';

  return this.obtenerAeropuertoPorCodigo(codigoOaci)?.pais ?? '—';
  }

  getContinenteAeropuerto(codigoOaci?: string): string {
    if (!codigoOaci) return '—';

    return this.obtenerAeropuertoPorCodigo(codigoOaci)?.continente ?? '—';
  }
}