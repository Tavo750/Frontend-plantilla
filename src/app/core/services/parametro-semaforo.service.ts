import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environment/environment';
import { ApiResponse } from '../interfaces/api-response.interface';
import { CacheService } from './cache.service';

export interface ParametroSemaforo {
  idParametro: number | null;
  entidad: string;
  umbralAmbar: number;
  umbralRojo:  number;
  activo:      boolean;
}

@Injectable({ providedIn: 'root' })
export class ParametroSemaforoService {
  private readonly url = `${environment.apiUrl}configuracion/semaforo`;
  private readonly CACHE_KEY = 'dp1_cache_semaforo';

  constructor(
    private readonly http: HttpClient,
    private readonly cache: CacheService
  ) {}

  listar(): Observable<ApiResponse<ParametroSemaforo[]>> {
    const cached = this.cache.get<ApiResponse<ParametroSemaforo[]>>(this.CACHE_KEY);
    if (cached) return of(cached);
    return this.http.get<ApiResponse<ParametroSemaforo[]>>(this.url).pipe(
      tap(resp => { if (resp?.data?.length) this.cache.set(this.CACHE_KEY, resp); })
    );
  }

  actualizar(id: number, body: ParametroSemaforo): Observable<ApiResponse<ParametroSemaforo>> {
    return this.http.put<ApiResponse<ParametroSemaforo>>(`${this.url}/${id}`, body).pipe(
      tap(() => this.cache.invalidate(this.CACHE_KEY))
    );
  }

  crear(body: ParametroSemaforo): Observable<ApiResponse<ParametroSemaforo>> {
    return this.http.post<ApiResponse<ParametroSemaforo>>(this.url, body).pipe(
      tap(() => this.cache.invalidate(this.CACHE_KEY))
    );
  }
}
