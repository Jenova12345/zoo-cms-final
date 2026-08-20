// Kostra znalostní báze, kterou editor předvyplní u nového druhu.
//
// V souboru je schválně JEN struktura nadpisů. Dřív tu byla celá metodika
// („jak psát") a u každé sekce ukázkový odstavec o pralesničce azurové. Když
// to kurátor uložil bez úprav, chatbot pak o jiném druhu tvrdil věci
// o pralesničce, text kb.md je jeho jediný zdroj, nerozliší vzor od faktu.
//
// Metodika i příklady se proto přesunuly do nápovědy v CMS (web/src/lib/
// kbSablona.ts), kde si je kurátor rozklikne, ale do souboru se nedostanou.
// Nadpisy zůstávají přesně takhle: chatbot podle nich hledá správnou pasáž.
export const KB_TEMPLATE = `# Název druhu

## Popis

## Potrava

## Habitat a výskyt

## Chování

## Rozmnožování

## Zajímavosti

## Ohrožení a ochrana

## V naší expozici
`;
