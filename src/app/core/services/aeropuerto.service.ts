import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environment/environment';
import { ApiResponse } from '../interfaces/api-response.interface';

export interface Aeropuerto {
  idAeropuerto: number;
  codigoOaci: string;
  ciudad: string;
  pais: string;
  codigo: string;
  gmt: number;
  continente: string;
  latitud: string;
  longitud: string;
  capacidad: number;
  activo: boolean;
}

@Injectable({ providedIn: 'root' })
export class AeropuertoService {

  private readonly apiUrl = `${environment.apiUrl}maestro/aeropuertos`;

  constructor(private readonly http: HttpClient) {}

  /** Siempre lee de la BD (sin caché en localStorage): así cualquier cambio de capacidad
   *  en Gestión de Aeropuertos se refleja al instante en los módulos que lo consumen. */
  listarAeropuertos(): Observable<ApiResponse<Aeropuerto[]>> {
    return this.http.get<ApiResponse<Aeropuerto[]>>(this.apiUrl);
  }

  /** Alias de listarAeropuertos (se mantiene por compatibilidad con quien lo llame). */
  refrescar(): Observable<ApiResponse<Aeropuerto[]>> {
    return this.http.get<ApiResponse<Aeropuerto[]>>(this.apiUrl);
  }
}
