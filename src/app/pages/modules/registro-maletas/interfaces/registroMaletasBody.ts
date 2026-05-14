export interface RegistroMaletaBody {
  idAerolinea:           number;
  id_aeropuerto_origen:  number;
  id_aeropuerto_destino: number;
  idPolitica:            number;
  cantidad:              number;
  fechaRegistro:         Date;
  fechaLimiteEntrega:    Date;
  horaRegistrada:        string;
}
