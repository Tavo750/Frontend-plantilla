/**
 * Interfaz genérica para respuestas de API.
 * Principio SOLID (I): Interfaz segregada para respuestas HTTP.
 */
export interface ApiResponse<T> {
  status: number;
  message: string;
  data: T;
  errors?: string[];
}

/**
 * Interfaz para respuestas paginadas.
 */
export interface PaginatedResponse<T> {
  items: T[];
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
