import {
  aplicarColapsoOcupacion,
  aplicarUpdateOcupaciones
} from '../src/app/pages/modules/simulacion/components/simulacion/ocupacion-aeropuertos-state';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const update419 = aplicarUpdateOcupaciones(new Map(), {
  SLLP: {
    ocupacionActual: 419,
    capacidadMaxima: 420,
    porcentaje: 99.76,
    entradas: 419,
    salidas: 0
  }
}, 1000, 0, false);
assert(update419.aplicado, 'El UPDATE 419/420 debe aplicarse');
assert(update419.ocupaciones.get('SLLP')?.ocupacionActual === 419,
  'La pantalla debe mostrar 419');

const colapso420 = aplicarColapsoOcupacion(
  update419.ocupaciones, 'SLLP', 420, 420);
assert(colapso420.get('SLLP')?.ocupacionActual === 420,
  'Aplicar colapso debe conservar 420 y no resetear a cero');

const exceso = aplicarColapsoOcupacion(
  update419.ocupaciones, 'SLLP', 487, 420).get('SLLP');
assert(exceso?.ocupacionActual === 487, 'La ocupacion no debe recortarse');
assert(Math.abs((exceso?.porcentaje ?? 0) - 115.9523809524) < 0.000001,
  'El porcentaje debe conservar el exceso real');

const tardio = aplicarUpdateOcupaciones(colapso420, {
  SLLP: { ocupacionActual: 0, capacidadMaxima: 420, porcentaje: 0 }
}, 2000, 1000, true);
assert(!tardio.aplicado, 'Un UPDATE tardio debe rechazarse tras el colapso');
assert(tardio.ocupaciones.get('SLLP')?.ocupacionActual === 420,
  'El UPDATE tardio no debe reemplazar el snapshot del colapso');

console.log('ocupacion-aeropuertos: 5 verificaciones correctas');
