import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../../environment/environment';
import { SimulacionPeriodoResponse } from '../models/simulacion-periodo.model';

@Injectable({
  providedIn: 'root'
})
export class SimulacionPeriodoService {

  private readonly baseUrl = `${environment.apiUrl}api/simulacion/periodo`;

  constructor(private http: HttpClient) {}

  ejecutarSimulacionPeriodo(
    fechaInicio: string,
    dias: number
  ): Observable<SimulacionPeriodoResponse> {
    const params = new HttpParams()
      .set('fechaInicio', fechaInicio)
      .set('dias', dias.toString());

    return this.http.post<SimulacionPeriodoResponse>(this.baseUrl, null, { params });
  }
}