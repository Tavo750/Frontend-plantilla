import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environment/environment';
import { ApiResponse } from '../interfaces/api-response.interface';

export interface Aerolinea {
  idAerolinea: number;
  nombre: string;
  codigo: string;
  activa?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AerolineaService {
  private readonly apiUrl = `${environment.apiUrl}maestro/aerolineas`;

  constructor(private readonly http: HttpClient) {}

  listarAerolineas(): Observable<ApiResponse<Aerolinea[]>> {
    return this.http.get<ApiResponse<Aerolinea[]>>(this.apiUrl);
  }
}
