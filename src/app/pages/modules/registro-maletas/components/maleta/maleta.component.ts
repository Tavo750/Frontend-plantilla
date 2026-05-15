import { Component, OnInit } from '@angular/core';
import { RegistroMaletasServices } from '../../services/registro-maletas.service';
import { Datum as AeropuertoDatum } from '../../interfaces/listaAeropuertoResponse';
import { Datum as PoliticaDatum } from '../../interfaces/listaPoliticasResponse';
import { RegistroMaletaBody } from '../../interfaces/registroMaletasBody';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-maleta',
  standalone: false,
  templateUrl: './maleta.component.html',
  styleUrl: './maleta.component.css',
  providers: [MessageService]
})
export class MaletaComponent implements OnInit {
  aeropuertos: AeropuertoDatum[] = [];
  politica!: PoliticaDatum;

  aeropuertoOrigen: AeropuertoDatum | null = null;
  aeropuertoDestino: AeropuertoDatum | null = null;
  cantidadMaletas: number = 1;

  plazoEntregaDias: number = 0;
  tipoVuelo: string = '';
  rutaNombres: string = '';
  rutaContinentes: string = '';
  mensajeEntrega: string = '';

  enviosSesion: any[] = [];
  cargandoRegistro: boolean = false;

  constructor(
    private registroService: RegistroMaletasServices,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.cargarDatosMaestros();
  }

  cargarDatosMaestros() {
    this.registroService.listarAeropuertos().subscribe({
      next: (res) => {
        if (res && res.data) {
          this.aeropuertos = res.data;
        }
      },
      error: (err) => console.error(err)
    });

    this.registroService.listarPoliticasEntrega().subscribe({
      next: (res) => {
        if (res && res.data && res.data.length > 0) {
          this.politica = res.data[0];
        }
      },
      error: (err) => console.error(err)
    });
  }

  onSeleccionCambiada() {
    if (this.aeropuertoOrigen && this.aeropuertoDestino && this.politica) {
      const mismoContinente = this.aeropuertoOrigen.continente === this.aeropuertoDestino.continente;
      
      this.tipoVuelo = mismoContinente ? 'Intracontinental' : 'Intercontinental';
      this.plazoEntregaDias = mismoContinente ? this.politica.diasMismoContinente : this.politica.diasDistintoContinente;
      
      this.rutaNombres = `${this.aeropuertoOrigen.ciudad} → ${this.aeropuertoDestino.ciudad}`;
      this.rutaContinentes = `${this.aeropuertoOrigen.continente} → ${this.aeropuertoDestino.continente}`;
      
      const textoContinente = mismoContinente ? 'Mismo continente' : 'Diferente continente';
      this.mensajeEntrega = `${textoContinente}: Entrega garantizada en ${this.plazoEntregaDias} días (tiempo de traslado: ${this.plazoEntregaDias * 24} horas)`;
    } else {
      this.tipoVuelo = '';
      this.plazoEntregaDias = 0;
      this.rutaNombres = '';
      this.rutaContinentes = '';
      this.mensajeEntrega = '';
    }
  }

  registrarEnvio() {
    if (!this.aeropuertoOrigen || !this.aeropuertoDestino || !this.cantidadMaletas || !this.politica) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Complete todos los campos requeridos' });
      return;
    }

    if (this.aeropuertoOrigen.idAeropuerto === this.aeropuertoDestino.idAeropuerto) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'El origen y destino no pueden ser iguales' });
      return;
    }

    if (this.cantidadMaletas > 50) {
       this.messageService.add({ severity: 'error', summary: 'Error', detail: 'El máximo permitido es 50 maletas por envío' });
       return;
    }

    this.cargandoRegistro = true;

    const fechaActual = new Date();
    
    // Calcular fecha límite sumando los días al día actual
    const fechaLimite = new Date(fechaActual);
    fechaLimite.setDate(fechaLimite.getDate() + this.plazoEntregaDias);

    const horas = String(fechaActual.getHours()).padStart(2, '0');
    const minutos = String(fechaActual.getMinutes()).padStart(2, '0');
    const segundos = String(fechaActual.getSeconds()).padStart(2, '0');
    const horaStr = `${horas}:${minutos}:${segundos}`;

    const body: RegistroMaletaBody = {
      idAerolinea: 1, // Valor por defecto o mock según el sistema
      id_aeropuerto_origen: this.aeropuertoOrigen.idAeropuerto,
      id_aeropuerto_destino: this.aeropuertoDestino.idAeropuerto,
      idPolitica: this.politica.idPolitica,
      cantidad: this.cantidadMaletas,
      fechaRegistro: fechaActual,
      fechaLimiteEntrega: fechaLimite,
      horaRegistrada: horaStr
    };

    this.registroService.registrarMaletas(body).subscribe({
      next: (res) => {
        this.cargandoRegistro = false;
        if (res && res.data) {
          this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Envío registrado correctamente' });
          
          // Agregar a la lista de sesión para mostrar en pantalla
          this.enviosSesion.unshift(res.data);
          
          // Limpiar formulario
          this.aeropuertoOrigen = null;
          this.aeropuertoDestino = null;
          this.cantidadMaletas = 1;
          this.onSeleccionCambiada();
        }
      },
      error: (err) => {
        this.cargandoRegistro = false;
        console.error(err);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Ocurrió un error al registrar el envío' });
      }
    });
  }
}
