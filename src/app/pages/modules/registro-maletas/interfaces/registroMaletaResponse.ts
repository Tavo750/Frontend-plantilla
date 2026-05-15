export interface RegistroMaletaResponse {
  status:  number;
  message: string;
  data:    Data;
}

export interface Data {
  idEnvio:            number;
  aerolinea:          Aerolinea;
  aeropuertoOrigen:   Aeropuerto;
  aeropuertoDestino:  Aeropuerto;
  politicaEntrega:    PoliticaEntrega;
  cantidad:           number;
  estado:             string;
  fechaRegistro:      Date;
  fechaLimiteEntrega: Date;
  horaRegistrada:     string;
  prioridad:          number;
}

export interface Aerolinea {
  idAerolinea: number;
  codigo:      string;
  nombre:      string;
  contrasenia: string;
  activa:      boolean;
}

export interface Aeropuerto {
  idAeropuerto: number;
  codigoOaci:   string;
  ciudad:       string;
  pais:         string;
  codigo:       string;
  gmt:          number;
  continente:   string;
  latitud:      string;
  longitud:     string;
  capacidad:    number;
  activo:       boolean;
}

export interface PoliticaEntrega {
  idPolitica:             number;
  diasMismoContinente:    number;
  diasDistintoContinente: number;
  activa:                 boolean;
}
