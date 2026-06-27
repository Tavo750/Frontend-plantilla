export interface LoginResponse {
    status:  number;
    message: string;
    data:    Data;
}

export interface Data {
    token:                 string;
    tipo:                  string;
    id:                    number;
    nombre:                string;
    apellidoPaterno:       string;
    apellidoMaterno:       string;
    nombreCompleto:        string;
    correo:                string;
    puesto:                string;
    fotoUrl:               string;
    estado:                boolean;
    idAeropuerto?:         number;
    codigoOaciAeropuerto?: string;
    ciudadAeropuerto?:     string;
}