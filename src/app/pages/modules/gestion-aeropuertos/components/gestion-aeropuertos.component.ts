import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { MessageService } from 'primeng/api';
import { GestionAeropuertosService, Aeropuerto } from '../../../../core/services/gestion-aeropuertos.service';

@Component({
  selector: 'app-gestion-aeropuertos',
  templateUrl: './gestion-aeropuertos.component.html',
  styleUrls: ['./gestion-aeropuertos.component.css'],
  standalone: false
})
export class GestionAeropuertosComponent implements OnInit {
  aeropuertos: Aeropuerto[] = [];
  aeropuertoSeleccionado: Aeropuerto | null = null;
  mostrarFormulario = false;
  cargando = false;
  zonas = [
    'UTC', 'UTC-1', 'UTC-2', 'UTC-3', 'UTC-4', 'UTC-5', 'UTC-6', 'UTC-7', 'UTC-8', 'UTC-9', 'UTC-10', 'UTC-11', 'UTC-12',
    'UTC+1', 'UTC+2', 'UTC+3', 'UTC+4', 'UTC+5', 'UTC+6', 'UTC+7', 'UTC+8', 'UTC+9', 'UTC+10', 'UTC+11', 'UTC+12'
  ];

  constructor(
    private aeroService: GestionAeropuertosService,
    private messageService: MessageService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarAeropuertos();
  }

  cargarAeropuertos(): void {
    this.cargando = true;
    this.aeroService.listar().subscribe({
      next: (resp: any) => {
        this.aeropuertos = (resp.data ?? []).map((aero: any) => ({
          id: aero.idAeropuerto || aero.id,
          idAeropuerto: aero.idAeropuerto || aero.id,
          codigoOaci: aero.codigoOaci,
          ciudad: aero.ciudad,
          pais: aero.pais,
          latitud: aero.latitud,
          longitud: aero.longitud,
          capacidadMaxima: aero.capacidad || aero.capacidadMaxima,
          zonaHoraria: aero.zonaHoraria || this.convertirGmtAZonaHoraria(aero.gmt),
          activo: aero.activo,
          gmt: aero.gmt,
          continente: aero.continente
        }));
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los aeropuertos' });
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  private convertirGmtAZonaHoraria(gmt: number | undefined): string {
    if (gmt === undefined || gmt === null) return 'UTC';
    if (gmt === 0) return 'UTC';
    return gmt > 0 ? `UTC+${gmt}` : `UTC${gmt}`;
  }

  abrirFormulario(aero?: Aeropuerto): void {
    this.aeropuertoSeleccionado = aero ? { ...aero } : {
      codigoOaci: '',
      ciudad: '',
      pais: '',
      latitud: 0,
      longitud: 0,
      capacidadMaxima: 400,
      zonaHoraria: 'UTC',
      activo: true
    };
    this.mostrarFormulario = true;
  }

  cerrarFormulario(): void {
    this.mostrarFormulario = false;
    this.aeropuertoSeleccionado = null;
  }

  guardarAeropuerto(): void {
    if (!this.aeropuertoSeleccionado) return;
    const aero = this.aeropuertoSeleccionado;
    const id = aero.id || aero.idAeropuerto;

    const payload = {
      codigoOaci: aero.codigoOaci,
      ciudad: aero.ciudad,
      pais: aero.pais,
      latitud: aero.latitud,
      longitud: aero.longitud,
      capacidad: aero.capacidadMaxima,
      gmt: aero.gmt || 0,
      continente: aero.continente,
      activo: aero.activo
    };

    const obs = id
      ? this.aeroService.actualizar(id, payload)
      : this.aeroService.crear(payload);

    obs.subscribe({
      next: (resp: any) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: id ? 'Aeropuerto actualizado' : 'Aeropuerto creado'
        });
        this.cargarAeropuertos();
        this.cerrarFormulario();
      },
      error: (err: any) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo guardar el aeropuerto'
        });
      }
    });

    // Validación de capacidad máxima
    const capacidad = Number(aero.capacidadMaxima);
    
    if (Number.isNaN(capacidad) || capacidad < 400 || capacidad > 800) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Capacidad invalida',
        detail: 'La capacidad maxima de almacen debe estar entre 400 y 800 maletas.'
      });
      return;
    }
  }

  eliminarAeropuerto(aero: Aeropuerto): void {
    if (!confirm('¿Está seguro de que desea eliminar este aeropuerto?')) return;
    const id = aero.id || aero.idAeropuerto;
    if (!id) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se puede eliminar sin ID' });
      return;
    }
    this.aeroService.eliminar(id).subscribe({
      next: (resp: any) => {
        this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Aeropuerto eliminado' });
        this.cargarAeropuertos();
      },
      error: (err: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar el aeropuerto' });
      }
    });
  }
}
