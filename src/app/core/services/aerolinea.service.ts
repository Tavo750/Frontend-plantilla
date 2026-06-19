import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environment/environment';
import { ApiResponse } from '../interfaces/api-response.interface';
import { CacheService } from './cache.service';

export interface Aerolinea {
  idAerolinea: number;
  nombre: string;
  codigo: string;
  activa?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AerolineaService {

  private readonly apiUrl = `${environment.apiUrl}maestro/aerolineas`;
  private readonly CACHE_KEY = 'dp1_cache_aerolineas';

  constructor(
    private readonly http: HttpClient,
    private readonly cache: CacheService
  ) {}

  listarAerolineas(): Observable<ApiResponse<Aerolinea[]>> {
    const cached = this.cache.get<ApiResponse<Aerolinea[]>>(this.CACHE_KEY);
    if (cached) return of(cached);
    return this.http.get<ApiResponse<Aerolinea[]>>(this.apiUrl).pipe(
      tap(resp => { if (resp?.data?.length) this.cache.set(this.CACHE_KEY, resp); })
    );
  }

  refrescar(): Observable<ApiResponse<Aerolinea[]>> {
    this.cache.invalidate(this.CACHE_KEY);
    return this.http.get<ApiResponse<Aerolinea[]>>(this.apiUrl).pipe(
      tap(resp => { if (resp?.data?.length) this.cache.set(this.CACHE_KEY, resp); })
    );
  }
}
