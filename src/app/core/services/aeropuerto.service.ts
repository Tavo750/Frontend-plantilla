import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environment/environment';
import { ApiResponse } from '../interfaces/api-response.interface';
import { CacheService } from './cache.service';

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
  private readonly CACHE_KEY = 'dp1_cache_aeropuertos';

  constructor(
    private readonly http: HttpClient,
    private readonly cache: CacheService
  ) {}

  listarAeropuertos(): Observable<ApiResponse<Aeropuerto[]>> {
    const cached = this.cache.get<ApiResponse<Aeropuerto[]>>(this.CACHE_KEY);
    if (cached) return of(cached);
    return this.http.get<ApiResponse<Aeropuerto[]>>(this.apiUrl).pipe(
      tap(resp => { if (resp?.data?.length) this.cache.set(this.CACHE_KEY, resp); })
    );
  }

  /** Fuerza recarga desde la BD e invalida el caché. */
  refrescar(): Observable<ApiResponse<Aeropuerto[]>> {
    this.cache.invalidate(this.CACHE_KEY);
    return this.http.get<ApiResponse<Aeropuerto[]>>(this.apiUrl).pipe(
      tap(resp => { if (resp?.data?.length) this.cache.set(this.CACHE_KEY, resp); })
    );
  }
}
