import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlApi } from '../../../../global';
import { ListaAeropuertoResponse } from '../interfaces/listaAeropuertoResponse';
import { RegistroMaletaBody } from '../interfaces/registroMaletasBody';
import { RegistroMaletaResponse } from '../interfaces/registroMaletaResponse';
import { ListaPoliticasResponse } from '../interfaces/listaPoliticasResponse';

@Injectable({
  providedIn: 'root',
})
export class RegistroMaletasServices {
  url:string = urlApi;

  constructor(private http: HttpClient) {}

  listarAeropuertos(): Observable<ListaAeropuertoResponse> {
    return this.http.get<ListaAeropuertoResponse>(`${this.url}api/maestro/aeropuertos`);
  }

  registrarMaletas(body: RegistroMaletaBody): Observable<RegistroMaletaResponse> {
    // Ajusta la ruta del endpoint según corresponda
    return this.http.post<RegistroMaletaResponse>(`${this.url}api/envio/registrar`, body);
  }

  listarPoliticasEntrega(): Observable<ListaPoliticasResponse> {
    return this.http.get<ListaPoliticasResponse>(`${this.url}api/maestro/politicas-entrega`);
  }
}
