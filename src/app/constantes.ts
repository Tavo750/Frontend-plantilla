// =====================================================================
// Interfaces para tipado de la estructura de navegación
// =====================================================================

interface Modulo {
  id: number;
  codigo: string;
}

interface Subseccion {
  id: number;
  codigo: string;
  modulos?: Modulo[];
}

interface Seccion {
  id: number;
  codigo: string;
  subsecciones: Subseccion[];
}

// =====================================================================
// Definición jerárquica del sistema de navegación
// =====================================================================
export const SISTEMA_NAV: Seccion[] = [
  {
    id: 1,
    codigo: 'INICIO',
    subsecciones: [
      { id: 1, codigo: 'ACCESO' }
    ]
  },
  {
    id: 2,
    codigo: 'DASHBOARD',
    subsecciones: [
      { id: 2, codigo: 'GENERAL' },
      { id: 3, codigo: 'REPORTES' }
    ]
  },
  {
    id: 3,
    codigo: 'CONFIGURACION',
    subsecciones: [
      { id: 4, codigo: 'USUARIOS' },
      { id: 5, codigo: 'ROLES' }
    ]
  }
];

// =====================================================================
// Funciones de utilidad para navegar la estructura jerárquica
// =====================================================================

export function getSubseccionesBySeccion(seccionCodigo: string): Subseccion[] {
  const seccion = SISTEMA_NAV.find(s => s.codigo === seccionCodigo);
  return seccion ? seccion.subsecciones : [];
}

export function getSubseccionByCodigo(seccionCodigo: string, subseccionCodigo: string): Subseccion | undefined {
  const seccion = SISTEMA_NAV.find(s => s.codigo === seccionCodigo);
  if (!seccion) return undefined;
  return seccion.subsecciones.find(sub => sub.codigo === subseccionCodigo);
}

export function getSeccionByCodigo(seccionCodigo: string): Seccion | undefined {
  return SISTEMA_NAV.find(s => s.codigo === seccionCodigo);
}

export function getSeccionById(seccionId: number): Seccion | undefined {
  return SISTEMA_NAV.find(s => s.id === seccionId);
}
