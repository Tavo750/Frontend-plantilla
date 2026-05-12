/**
 * Interfaz que representa un usuario del sistema.
 * Principio SOLID (I): Interfaz segregada solo con los datos del usuario.
 */
export interface Usuario {
  id: number;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  nombreCompleto: string;
  correo: string;
  puesto?: string;
  fotoUrl?: string;
  estado: boolean;
}
