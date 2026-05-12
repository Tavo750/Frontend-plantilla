/**
 * Interfaz para datos adicionales de un item de menú del sidebar.
 * Principio SOLID (I): Interfaz segregada específica para menú.
 */
export interface MenuItemData {
  seccion?: {
    id: number;
    codigo: string;
  };
  subseccion?: {
    id: number;
    codigo: string;
    parent_seccion_id: number;
  };
  parentId?: number;
}
