import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { MessageService } from 'primeng/api';
import { EnvioService, EnvioMaletas } from '../../../../../core/services/envio.service';

@Component({
  selector: 'app-rutas',
  standalone: false,
  templateUrl: './rutas.component.html',
  styleUrl: './rutas.component.css'
})
export class RutasComponent implements OnInit {
  envios: EnvioMaletas[] = [];
  enviosFiltrados: EnvioMaletas[] = [];
  cargando = false;
  error = false;

  estadoOpciones = [
    { label: 'Todos', value: null },
    { label: 'Registrada', value: 'REGISTRADA' },
    { label: 'En tránsito', value: 'EN_TRANSITO' },
    { label: 'Entregada', value: 'ENTREGADA' },
    { label: 'Retrasada', value: 'RETRASADA' },
    { label: 'En espera', value: 'EN_ESPERA' }
  ];
  estadoSeleccionado: string | null = null;

  constructor(
    private readonly envioService: EnvioService,
    private readonly messageService: MessageService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarEnvios();
  }

  cargarEnvios(): void {
    this.cargando = true;
    this.error = false;

    this.envioService.listarEnvios().subscribe({
      next: (response) => {
        this.envios = response.data ?? [];
        this.enviosFiltrados = [...this.envios];
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
          detail: 'No se pudo cargar la lista de envíos. Verifica que el backend esté activo.'
        });
      }
    });
  }

  filtrarPorEstado(estado: string | null): void {
    this.estadoSeleccionado = estado;
    if (!estado) {
      this.enviosFiltrados = [...this.envios];
    } else {
      this.enviosFiltrados = this.envios.filter(e => e.estado === estado);
    }
  }

  filtrarTabla(event: Event): void {
    const texto = (event.target as HTMLInputElement).value.toLowerCase();
    const base = this.estadoSeleccionado
      ? this.envios.filter(e => e.estado === this.estadoSeleccionado)
      : this.envios;

    this.enviosFiltrados = base.filter(e =>
      (e.aeropuertoOrigen?.codigoOaci ?? '').toLowerCase().includes(texto) ||
      (e.aeropuertoOrigen?.ciudad ?? '').toLowerCase().includes(texto) ||
      (e.aeropuertoDestino?.codigoOaci ?? '').toLowerCase().includes(texto) ||
      (e.aeropuertoDestino?.ciudad ?? '').toLowerCase().includes(texto) ||
      (e.aerolinea?.nombre ?? '').toLowerCase().includes(texto)
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
    return this.enviosFiltrados.reduce((sum, e) => sum + e.cantidad, 0);
  }
}
