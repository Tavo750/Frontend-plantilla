export interface ListaAeropuertoResponse {
  status:  number;
  message: string;
  data:    Datum[];
}

export interface Datum {
  idAeropuerto: number;
  codigoOaci:   string;
  ciudad:       string;
  pais:         string;
  codigo:       string;
  gmt:          number;
  continente:   Continente;
  latitud:      string;
  longitud:     string;
  capacidad:    number;
  activo:       boolean;
}

export enum Continente {
  America = "AMERICA",
  Asia = "ASIA",
  Europa = "EUROPA",
}
