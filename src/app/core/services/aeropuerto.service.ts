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

@Injectable({
  providedIn: 'root'
})
export class AeropuertoService {
  private readonly apiUrl = `${environment.apiUrl}maestro/aeropuertos`;

  constructor(private readonly http: HttpClient) {}

  listarAeropuertos(): Observable<ApiResponse<Aeropuerto[]>> {
    return this.http.get<ApiResponse<Aeropuerto[]>>(this.apiUrl);
  }
}
