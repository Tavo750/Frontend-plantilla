export interface ListaPoliticasResponse {
  status:  number;
  message: string;
  data:    Datum[];
}

export interface Datum {
  idPolitica:             number;
  diasMismoContinente:    number;
  diasDistintoContinente: number;
  activa:                 boolean;
}
