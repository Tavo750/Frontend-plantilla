import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environment/environment';
import { ApiResponse } from '../interfaces/api-response.interface';

export interface AeropuertoRef {
  idAeropuerto: number;
  codigoOaci: string;
  ciudad: string;
  pais: string;
}

export interface AerolineaRef {
  idAerolinea: number;
  nombre: string;
  codigo: string;
}

export interface EnvioMaletas {
  idEnvio: number;
  cantidad: number;
  estado: string;
  fechaRegistro: string;
  fechaLimiteEntrega: string;
  horaRegistrada: string;
  prioridad: number;
  aeropuertoOrigen: AeropuertoRef;
  aeropuertoDestino: AeropuertoRef;
  aerolinea: AerolineaRef;
}

@Injectable({
  providedIn: 'root'
})
export class EnvioService {
  private readonly apiUrl = `${environment.apiUrl}envio/envios-maletas`;

  constructor(private readonly http: HttpClient) {}

  listarEnvios(): Observable<ApiResponse<EnvioMaletas[]>> {
    return this.http.get<ApiResponse<EnvioMaletas[]>>(this.apiUrl);
  }

  crearEnvio(body: {
    idAeropuertoOrigen: number;
    idAeropuertoDestino: number;
    cantidad: number;
  }): Observable<ApiResponse<EnvioMaletas>> {
    return this.http.post<ApiResponse<EnvioMaletas>>(this.apiUrl, body);
  }

  /** Crea múltiples envíos en una sola petición (carga masiva CSV). */
  crearEnviosBatch(envios: {
    idAeropuertoOrigen: number;
    idAeropuertoDestino: number;
    cantidad: number;
  }[]): Observable<ApiResponse<EnvioMaletas[]>> {
    return this.http.post<ApiResponse<EnvioMaletas[]>>(`${this.apiUrl}/batch`, envios);
  }
}
