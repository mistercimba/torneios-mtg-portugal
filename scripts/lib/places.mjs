// Localidade → distrito (Portugal continental + regiões autónomas).
// Factos geográficos, não estimativas: uma localidade fora desta tabela fica
// sem distrito e aparece no relatório de revisão para ser acrescentada aqui.
// As chaves são comparadas sem acentos nem maiúsculas.

export const DISTRICTS = [
  'Aveiro', 'Beja', 'Braga', 'Bragança', 'Castelo Branco', 'Coimbra', 'Évora', 'Faro',
  'Guarda', 'Leiria', 'Lisboa', 'Portalegre', 'Porto', 'Santarém', 'Setúbal',
  'Viana do Castelo', 'Vila Real', 'Viseu', 'Açores', 'Madeira',
];

const LOCALITIES = {
  // Capitais de distrito
  ...Object.fromEntries(DISTRICTS.map(d => [d, d])),
  'Ponta Delgada': 'Açores', 'Angra do Heroísmo': 'Açores', 'Funchal': 'Madeira',
  // Lisboa
  'Amadora': 'Lisboa', 'Arruda dos Vinhos': 'Lisboa', 'Benfica': 'Lisboa', 'Cascais': 'Lisboa',
  'Ericeira': 'Lisboa', 'Linda-a-Velha': 'Lisboa', 'Loures': 'Lisboa', 'Mafra': 'Lisboa',
  'Odivelas': 'Lisboa', 'Oeiras': 'Lisboa', 'Queluz': 'Lisboa', 'Rio de Mouro': 'Lisboa',
  'Sintra': 'Lisboa', 'Torres Vedras': 'Lisboa', 'Vila Franca de Xira': 'Lisboa',
  'Alverca do Ribatejo': 'Lisboa', 'Carcavelos': 'Lisboa', 'Algés': 'Lisboa', 'Sacavém': 'Lisboa',
  // Setúbal
  'Almada': 'Setúbal', 'Barreiro': 'Setúbal', 'Seixal': 'Setúbal', 'Montijo': 'Setúbal',
  'Moita': 'Setúbal', 'Palmela': 'Setúbal', 'Sesimbra': 'Setúbal', 'Corroios': 'Setúbal',
  // Porto
  'Avintes': 'Porto', 'Vila Nova de Gaia': 'Porto', 'Matosinhos': 'Porto', 'Maia': 'Porto',
  'Gondomar': 'Porto', 'Valongo': 'Porto', 'Póvoa de Varzim': 'Porto', 'Vila do Conde': 'Porto',
  'Paredes': 'Porto', 'Penafiel': 'Porto', 'Santo Tirso': 'Porto',
  // Braga
  'Vila Nova de Famalicão': 'Braga', 'Guimarães': 'Braga', 'Barcelos': 'Braga',
  // Faro
  'Quarteira': 'Faro', 'Portimão': 'Faro', 'Loulé': 'Faro', 'Albufeira': 'Faro',
  'Lagos': 'Faro', 'Olhão': 'Faro', 'Tavira': 'Faro',
  // Santarém
  'Torres Novas': 'Santarém', 'Entroncamento': 'Santarém', 'Tomar': 'Santarém', 'Abrantes': 'Santarém',
  // Outros
  'Caldas da Rainha': 'Leiria', 'Marinha Grande': 'Leiria', 'Figueira da Foz': 'Coimbra',
  'Covilhã': 'Castelo Branco', 'Ílhavo': 'Aveiro', 'Ovar': 'Aveiro', 'Santa Maria da Feira': 'Aveiro',
  'Espinho': 'Aveiro', 'Chaves': 'Vila Real',
};

export const normalizeKey = s => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const INDEX = new Map(Object.entries(LOCALITIES).map(([k, v]) => [normalizeKey(k), v]));

export function districtFor(locality) {
  if (!locality) return null;
  return INDEX.get(normalizeKey(locality)) ?? null;
}

export function isPortugal(country) {
  return ['portugal', 'pt'].includes(normalizeKey(country));
}
