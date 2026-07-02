import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environment/environment';
import { ApiResponse } from '../interfaces/api-response.interface';
import { EnvioMaletas } from './envio.service';

@Injectable({
  providedIn: 'root'
})
export class EnvioDiarioService {
  private readonly apiUrl = `${environment.apiUrl}envio/envio-diario`;

  constructor(private readonly http: HttpClient) {}

  listarEnvios(): Observable<ApiResponse<EnvioMaletas[]>> {
    return this.http.get<ApiResponse<EnvioMaletas[]>>(this.apiUrl);
  }

  listarEnviosPorAeropuerto(idAeropuerto: number): Observable<ApiResponse<EnvioMaletas[]>> {
    return this.http.get<ApiResponse<EnvioMaletas[]>>(
      `${this.apiUrl}/aeropuerto/${idAeropuerto}`
    );
  }

  obtenerPorId(id: number): Observable<ApiResponse<EnvioMaletas>> {
    return this.http.get<ApiResponse<EnvioMaletas>>(`${this.apiUrl}/${id}`);
  }

  crearEnvio(body: {
    idAeropuertoOrigen: number;
    idAeropuertoDestino: number;
    cantidad: number;
  }): Observable<ApiResponse<EnvioMaletas>> {
    return this.http.post<ApiResponse<EnvioMaletas>>(this.apiUrl, body);
  }

  actualizarEnvio(id: number, envio: Partial<EnvioMaletas>): Observable<ApiResponse<EnvioMaletas>> {
    return this.http.put<ApiResponse<EnvioMaletas>>(`${this.apiUrl}/${id}`, envio);
  }

  eliminarEnvio(id: number): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.apiUrl}/${id}`);
  }
}