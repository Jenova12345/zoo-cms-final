// Výchozí šablona kb.md od Dana (chatbot). Nabízí se kurátorovi, když se pro
// displej poprvé zakládá znalostní báze nebo je kb.md prázdný. Existující
// vyplněný kb.md se nikdy nepřepisuje. Obsah držíme přesně podle předlohy
// (nadpisy i kurzívové nápovědy), ať chatbot dostává konzistentní strukturu.

export const KB_TEMPLATE = `# Šablona kb.md pro kurátory — znalostní báze druhu

> **Tento soubor je vzor.** Zkopírujte strukturu a vyplňte pro konkrétní druh.
> Text pod nadpisy je nápověda — přepište ho vlastním obsahem.
> Chatbot čerpá odpovědi POUZE z tohoto textu, takže co tu není, o tom neřekne.

---

## Jak to funguje (přečtěte si prosím, než začnete psát)

Tento soubor (\`kb.md\`) je zdroj, ze kterého chatbot odpovídá návštěvníkům na dotazy
o tomto druhu. Několik zásad, které zásadně zlepší kvalitu odpovědí:

1. **Pište pro laika, ne odborně.** Chatbot si tón sám upraví podle toho, jestli se ptá
   dítě nebo dospělý. Vy dodáváte fakta, ne stylizaci.
2. **Jedna myšlenka = jeden odstavec.** Krátké odstavce se lépe vyhledávají než dlouhé bloky.
3. **Fakta pište konkrétně.** „Dožívá se 10-15 let" je lepší než „žije poměrně dlouho".
   Konkrétní čísla, jména, místa.
4. **Držte nadpisy (## Popis, ## Potrava…).** Pomáhají chatbotovi najít správnou pasáž.
   Nadpisy neměňte, jen vyplňujte obsah pod nimi.
5. **Co nevíte, nevymýšlejte.** Radši sekci nechte kratší. Chatbot má instrukci nevymýšlet
   si — když informace chybí, řekne návštěvníkovi, že to neví, místo aby fabuloval.
6. **Nemusíte vyplnit všechny sekce.** Když druh nemá zajímavost hodnou zmínky, sekci
   klidně vynechte. Ale čím víc kvalitního obsahu, tím lepší chatbot.

---

## Popis

*Základní představení druhu. Co to je, jak vypadá, jak je velký, jak dlouho se dožívá.
Barvy, výrazné znaky, čím je nápadný nebo zajímavý na první pohled.*

Příklad (pralesnička azurová): Pralesnička azurová je drobná jedovatá žába z čeledi
pralesničkovitých. Dorůstá délky 3 až 4,5 cm. Je nápadně azurově modrá s černými skvrnami,
které jsou u každého jedince jedinečné jako otisk prstu. Dožívá se v péči člověka běžně
10 až 15 let, ve volné přírodě méně.

---

## Potrava

*Čím se druh živí ve volné přírodě a čím v naší péči. Jak loví nebo získává potravu.
Případné zvláštnosti ve stravování.*

Příklad: Ve volné přírodě se živí drobnými bezobratlými — mravenci, roztoči, termity
a dalším hmyzem. Právě z této potravy získává látky, ze kterých si tvoří svůj jed.
V naší péči dostává pěstěný hmyz (octomilky, cvrčky), který tyto jedovaté látky
neobsahuje — proto zvířata chovaná v zoo nejsou jedovatá.

---

## Habitat a výskyt

*Kde druh žije — geograficky (země, oblast) i typ prostředí (deštný prales, jezero…).
Jaké podmínky potřebuje (vlhkost, teplota). Případně mapa výskytu.*

Příklad: Pochází z tropických deštných lesů na severu Jižní Ameriky, především z oblasti
jižní Guyany a přilehlé Brazílie. Žije na vlhké lesní půdě poblíž potoků a tůní, kde je
vysoká vzdušná vlhkost a stabilní teplota kolem 25 °C.

---

## Chování

*Jak se druh chová — denní/noční aktivita, sociální chování, komunikace, teritorialita.
Jak se pohybuje, jak reaguje na okolí.*

Příklad: Pralesnička je aktivní přes den, což je mezi žabami neobvyklé. Svou jasnou barvou
dává predátorům najevo, že je jedovatá — tomuto varování se říká aposematismus. Samci jsou
teritoriální a svá místa si hájí voláním.

---

## Rozmnožování

*Jak se druh rozmnožuje — období, námluvy, kladení vajíček, péče o potomstvo, vývoj mláďat.*

Příklad: Samice klade vajíčka na vlhký povrch listů nebo na lesní půdu. O snůšku pečuje
samec — udržuje ji vlhkou. Po vylíhnutí přenáší pulce na zádech do malých vodních nádrží,
kde se vyvíjejí v dospělé žáby.

---

## Zajímavosti

*Zajímavé, překvapivé nebo zapamatovatelné skutečnosti. To, co si návštěvník odnese.
Ideální pro tlačítko „Řekni mi zajímavost". Klidně několik oddělených bodů.*

Příklad:
- Jed pralesničky není vrozený — získává ho z potravy, takže v zoo jedovatá není.
- Černý vzor skvrn má každá pralesnička jiný, jako lidský otisk prstu.
- Původní obyvatelé Jižní Ameriky používali jed příbuzných druhů k otravě šípů.

---

## Ohrožení a ochrana

*Jestli je druh ohrožený, čím, a jak se chrání. Role zoo v ochraně druhu.*

Příklad: Hlavní hrozbou je ztráta deštného pralesa a odchyt pro nelegální obchod.
Chov v zoologických zahradách pomáhá udržet zdravou populaci mimo volnou přírodu
a snižuje tlak na odchyt divokých jedinců.

---

## V naší expozici

*Specifické k jedincům v ZOO Ostrava — kolik jich tu je, jak se jmenují, čím jsou zvláštní,
kdy je nejlépe pozorovat. Osobní, konkrétní — návštěvníky to baví.*

Příklad: V našem pavilonu Amphibiarium chováme malou skupinu pralesniček. Nejlépe je
zahlédnete dopoledne, kdy jsou nejaktivnější a pohybují se po terarijní podestýlce.

---

> **Hotovo?** Zkontrolujte, že jste psali konkrétně a pro laika. Až soubor uložíte přes CMS,
> chatbot se o změně dozví a nové informace začne používat během chvíle.
`;
