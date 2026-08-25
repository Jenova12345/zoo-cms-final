# Příručka pro kurátory. Amphibiárium, ZOO Ostrava

Tahle příručka je pro lidi, kteří v CMS připravují obsah displejů v pavilonu.
Nepotřebujete žádné technické znalosti, stačí prohlížeč a přihlašovací údaje.

Systém se jmenuje **Amphibiárium · Vzdálený přístup**. Každý displej v pavilonu
má v systému své číslo (1 až 37) a svůj obsah: informace o druhu, fotky, video
a podklady pro AI průvodce (chatbota).

---

## Obsah

1. [Přihlášení](#1-přihlášení)
2. [Výběr displeje](#2-výběr-displeje)
3. [Jak je displej poskládaný](#3-jak-je-displej-poskládaný)
4. [Info panel, základní údaje o druhu](#4-info-panel--základní-údaje-o-druhu)
5. [Fotky a mapa výskytu](#5-fotky-a-mapa-výskytu)
6. [Zajímavost, obecné informace a 3D model](#6-zajímavost-obecné-informace-a-3d-model)
7. [Video](#7-video)
8. [Přidání, odebrání a přesun slidu](#8-přidání-odebrání-a-přesun-slidu)
9. [Znalostní báze pro chatbota (kb.md)](#9-znalostní-báze-pro-chatbota-kbmd)
10. [Uložení a odeslání na displej](#10-uložení-a-odeslání-na-displej)
11. [Náhled tabletu](#11-náhled-tabletu)
12. [Deštný prales, prostředí a bouřka](#12-deštný-prales-prostředí-a-bouřka)
13. [Videomapping, zapnutí a vypnutí](#13-videomapping-zapnutí-a-vypnutí)
14. [Audit log, kdo co změnil](#14-audit-log--kdo-co-změnil)
15. [Časté otázky a drobné potíže](#15-časté-otázky-a-drobné-potíže)

---

## 1. Přihlášení

1. Otevřete v prohlížeči adresu CMS. Na počítači, kde systém běží, je to
   **http://127.0.0.1:3000**. Pokud pracujete z jiného počítače v pavilonu,
   adresu vám dá správce systému.
2. Vyplňte **Přihlašovací jméno** a **Heslo**. Účet vám zřizuje správce,
   registrace v systému není.
3. Klikněte na **Přihlásit se**.

Po přihlášení se otevře **Přehled provozu**.

**Dobré vědět:**

- Na velikosti písmen v přihlašovacím jméně nezáleží (`Spravce` i `spravce`
  fungují stejně). U hesla na velikosti písmen **záleží**.
- Když se přihlášení nepovede, systém napíše jen „Neplatné přihlašovací údaje."
  Nepozná se z toho, jestli bylo špatně jméno, nebo heslo, je to schválně.
- Přihlášení platí **12 hodin**. Potom vás systém pošle znovu na přihlašovací
  stránku. Nedokončené, neuložené změny se v tu chvíli ztratí, proto ukládejte
  průběžně.
- Odhlásíte se tlačítkem **Odhlásit** úplně dole v levém sloupci.
- Heslo si nezměníte sami, o změnu požádejte správce systému.

### Co je v levém menu

| Položka | K čemu je |
|---|---|
| **Přehled** | Dotazy návštěvníků na AI: kolik jich bylo, na co chatbot neodpověděl a u kterých druhů se lidé ptají nejvíc. Je tu i **mapa dotazů na půdorysu pavilonu**, barevné body jsou displeje, čím teplejší barva, tím víc dotazů; nájezdem myši se ukáže číslo displeje, druh a počet dotazů. Čísla dodává chatbot, když jeho služba neběží, stránka to napíše místo čísel. Pro práci s obsahem ji nepotřebujete. |
| **Displeje** | Tady se pracuje. Seznam všech 37 displejů. |
| **Audit log** | Kdo, kdy a co v systému změnil. |

---

## 2. Výběr displeje

Klikněte v levém menu na **Displeje**. Uvidíte dlaždice všech 37 displejů.

Na každé dlaždici je:

- **číslo displeje** (01, 02, 03 …), odpovídá číslu displeje v pavilonu,
- **název druhu**. Když je napsaný *kurzívou* jako „Nepřiřazeno", displej zatím
  žádný druh nemá a je připravený k naplnění,
- **datum poslední změny**,
- **barevná tečka** vpravo: zelená = displej je veden jako online, červená = offline.

Nahoře vpravo je políčko **Hledat číslo nebo druh**, napište třeba `axolotl`
nebo `12` a seznam se zúží.

**Kliknutím na dlaždici otevřete detail displeje**, kde se obsah edituje.

---

## 3. Jak je displej poskládaný

Obsah jednoho displeje je řada **slidů**, které se na tabletu u expozice
přehrávají za sebou dokola. Slidy jsou **šesti typů**:

| Typ slidu | Co na něm je |
|---|---|
| **Infopanel** | Vyplněné údaje o druhu (sekce, název, latinsky, strava…), fotky včetně mapy výskytu a nepovinně jedno video. |
| **AI otázky** | Místo, kde se návštěvník může zeptat AI průvodce. Nic se do něj nevyplňuje. |
| **3D model** | Sekvence snímků, kterými se model na tabletu otáčí. |
| **Video** | Jedno video ve formátu MP4. |
| **Zajímavost** | Delší text o druhu a k němu jedna fotka. |
| **Obecné informace** | Dva delší texty o druhu: **Obecný text** a **Zajímavosti**. Bez fotek a bez videa. |

Slidy vidíte v detailu displeje jako **záložky** pod hlavičkou, očíslované
zleva doprava v pořadí, ve kterém se budou přehrávat:

```
1 · Infopanel   2 · AI otázky   3 · 3D model   4 · Video   5 · Zajímavost   6 · Obecné informace   + Přidat slide      ✦ Znalostní báze (AI)
```

**Displej, který ještě nemá obsah** (v seznamu je jako „Nepřiřazeno") žádné
záložky slidů nemá. Místo nich systém napíše „Tento displej zatím nemá obsah"
a nabídne tlačítko **Přidat Infopanel**, tím je nejlepší začít. Když displej
slidy má, ale ještě nemá vyplněný název druhu, upozorní na to oranžový pruh
pod hlavičkou.

Úplně vpravo je oranžová záložka **Znalostní báze (AI)**. Ta **není slide**,
je to text, ze kterého odpovídá chatbot. Platí pro celý displej, ne pro jeden
slide. Podrobně v [kapitole 9](#9-znalostní-báze-pro-chatbota-kbmd).

Nad hlavičkou je ještě řádek **Jazyk**. Zatím je aktivní jen **Čeština**,
ostatní jazyky jsou označené „brzy" a nejdou vybrat.

---

## 4. Info panel, základní údaje o druhu

Otevřete záložku slidu **Infopanel**. Vlevo je formulář s údaji o druhu.

### Povinná pole

Bez těchto dvou se slide neuloží:

- **Sekce**, vybírá se z rozbalovacího seznamu (nedá se napsat vlastní text).
  Na výběr je: Listovnice, Caudata, Červoři, Lezci, Madagaskar, Neotenie,
  Obojživelníci České republiky, Pralesničky, Rozmanitost žab, Šesté vymírání.
  Sekce říká, do které zóny expozice druh patří.
- **Název**, český název druhu, například `Axolotl mexický`. Tenhle název se
  zároveň propíše do seznamu displejů, takže dlaždice přestane být „Nepřiřazeno".

Povinná pole poznáte podle červeného štítku **POVINNÉ** za jménem pole. Když
je necháte prázdná a kliknete na uložení:

- pole se orámuje červeně a pod ním se objeví „Tohle pole je potřeba vyplnit.",
- nad tlačítkem uložení se vypíše, co přesně chybí („Ještě chybí vyplnit:
  Sekce, Název."),
- kurzor sám skočí do prvního nevyplněného pole.

Nic se přitom neztratí, rozepsaný obsah zůstává, jen se neuloží, dokud povinná
pole nevyplníte.

### Nápovědy a počítadla pod poli

Pod každým polem je **šedá nápověda**, co do něj patří. U polí s limitem je
vpravo navíc **počítadlo** (např. „44 / 60 znaků"). Když doporučenou délku
překročíte, počítadlo zoranžoví a připíše „na tabletu se může zkrátit".

Je to **doporučení, ne zákaz**, uložit jde i delší text. Displej v pavilonu má
ale pevné rozvržení, takže co se nevejde, tablet ořízne. Vždycky se vyplatí
kouknout na **Náhled tabletu**, jak text ve skutečnosti vypadá.

### Volitelná pole

Prázdné volitelné pole se neuloží a na tabletu se vůbec nezobrazí, nemusíte
tedy nic vymýšlet jen proto, aby políčko nebylo prázdné.

- **Latinský název**, například `Ambystoma mexicanum`.
- **Strava**
- **Velikost**
- **Doba líhnutí**
- **Ohrožení**
- **Délka života**
- **Čeleď (taxonomická)**, například `Dendrobatidae`. Tohle pole se
  **nezobrazuje na tabletu**; slouží jen chatbotovi k rozpoznání druhu.

### Latinský název se automaticky upraví

Latinské jméno musí mít pro chatbota vždycky stejný tvar, proto ho systém sám
očistí: odebere uvozovky a tečku na konci, spraví velká a malá písmena.

Když do pole napíšete `dendrobates tinctorius "azureus".`, hned pod polem se
oranžově objeví nápověda:

> Uloží se v kanonickém tvaru: **Dendrobates tinctorius azureus**

Je to v pořádku, nechte to být, po uložení uvidíte upravený tvar. Systém vás
na úpravu ještě jednou upozorní v hlášce po uložení.

### Uložení

Dole pod formulářem je tlačítko **Uložit a odeslat na displej**. Jedním klikem
údaje uloží a rovnou je pošle na displej. Viz [kapitola 10](#10-uložení-a-odeslání-na-displej).

---

## 5. Fotky a mapa výskytu

Fotky info panelu jsou v pravé polovině obrazovky, vedle formuláře.

### Nahrání fotky

1. Buď **přetáhněte** soubory myší do rámečku „Přetáhněte fotky sem nebo
   klikněte", nebo na rámeček **klikněte** a vyberte soubory z počítače.
2. Můžete vybrat i **víc fotek najednou**.
3. Fotky nahrávejte jako **JPG nebo PNG**. Systém si je sám převede do formátu,
   který umí tablet přečíst (PNG), a sám je i správně otočí podle toho, jak
   byly vyfocené.

> **Fotky se ukládají hned po nahrání.** Nemusíte na nic klikat, jakmile
> zmizí kolečko načítání a objeví se náhled, fotka je uložená na disku.

### Označení mapy výskytu

Jednu z fotek info panelu můžete označit jako **mapu výskytu**. Tablet ji pak
zobrazí s popiskem „Mapa výskytu".

1. Najeďte myší na fotku, která je mapou.
2. Ve spodní liště fotky se objeví dvě ikonky. Klikněte na **ikonku mapy**
   (vlevo).
3. Fotka se orámuje oranžově a dostane štítek **mapa výskytu**.

Mapa může být na info panelu **jen jedna**. Když označíte jinou fotku, ta
původní se automaticky vrátí mezi běžné fotky, nic se nesmaže.

### Video na info panelu (nepovinné)

Pod fotkami je ještě blok **Video info panelu**. Sem se dá nahrát jedno MP4
přímo k info panelu, na tabletu se zařadí **před fotky**. Není povinné a se
samostatným slidem **Video** nemá nic společného: klidně můžete mít obojí.

**Zrušení označení:** najeďte na fotku s oranžovým rámečkem a klikněte na
**křížek**. Z mapy se stane běžná fotka.

### Smazání fotky

Najeďte myší na fotku a klikněte na **ikonku koše**. Fotka se smaže okamžitě
a nedá se vrátit, systém se na nic neptá.

---

## 6. Zajímavost, obecné informace a 3D model

### Zajímavost

Slide **Zajímavost** je delší povídání o druhu a k němu jedna fotka. Na tabletu
je text vlevo a fotka vpravo.

1. Otevřete záložku slidu **Zajímavost**.
2. Vlevo do velkého pole napište text. Pod polem se průběžně počítají slova,
   text se na displeji **neroluje**, takže se držte do **150 až 200 slov**.
3. Vpravo nahrajte **jednu** fotku (přetažením nebo kliknutím do rámečku).
   Když nahrajete další, ta původní se nahradí.
4. Klikněte na **Uložit a odeslat na displej**. Fotka se ukládá hned po
   nahrání, text až tímto tlačítkem.

### Obecné informace

Slide **Obecné informace** je čistě textový: dvě velká pole, žádné fotky ani
video. Hodí se na souvislejší povídání o druhu, které se nevejde do heslovitých
údajů na Infopanelu.

1. Otevřete záložku slidu **Obecné informace**.
2. Do pole **Obecný text** napište souvislý text o druhu, klidně na několik
   odstavců.
3. Do pole **Zajímavosti** napište, co návštěvníka zaujme. Klidně několik bodů
   pod sebou.
4. Klikněte na **Uložit**.

**Stačí vyplnit aspoň jedno z obou polí.** Rozepsaný slide si můžete uložit
kdykoliv; dokud je ale úplně prázdný, nejde označit za hotový (na tabletu by
zůstalo prázdné místo).

Pod každým polem se počítají slova. Text se na displeji **neroluje**, takže se
u obou polí držte zhruba **do 250 slov**.

**Oba texty se překládají.** Na rozdíl od Infopanelu tu není nic společného
s češtinou: v záložkách **English** a **Polski** vyplňujete obě pole znovu.
Dokud v některém jazyce chybí, hlásí to počítadlo „chybí" u přepínače jazyka.
Pod prázdným polem se v překladu ukáže **český originál** jako podklad,
schválně se nepředvyplňuje, ať se čeština omylem neuloží jako angličtina.

### 3D model

Slide **3D model** není soubor modelu, ale **sekvence obrázků**, snímky, jak
se model postupně otáčí. Tablet mezi nimi přepíná, takže to vypadá jako
otáčení.

1. Otevřete záložku slidu **3D model**.
2. Přetáhněte do rámečku **všechny snímky najednou**. Seřadí se podle názvu
   souboru, takže snímky z renderu (`frame_001.png`, `frame_002.png`…) přijdou
   ve správném pořadí.
3. Systém je uloží pod názvy `001.png`, `002.png`… Nad každým snímkem vidíte
   jeho pořadové číslo.
4. Smazání: najeďte na snímek a klikněte na **ikonku koše**. Zbylé snímky se
   automaticky přečíslují, v sekvenci nezůstane díra.

V náhledu tabletu se sekvence sama nepřehrává, snímky projdete **šipkami** po
stranách, dole vpravo je vidět, kolikátý snímek se dívá.

---

## 7. Video

Slide typu **Video** nese **jedno** video. (Jedno video se dá nahrát i přímo
k info panelu, viz [kapitola 5](#5-fotky-a-mapa-výskytu), postup je stejný.)

1. Otevřete záložku slidu **Video**.
2. Klikněte na rámeček **Nahrát video (MP4)** a vyberte soubor z počítače.
3. Video musí být ve formátu **MP4**. Jiný formát systém odmítne hláškou
   „Nahrajte prosím video ve formátu MP4."
4. Po nahrání se video rovnou přehraje v náhledu.

**Výměna videa:** klikněte na **Nahradit video** a vyberte nový soubor. Staré
video se automaticky smaže, na jednom slidu je vždy jen jedno.

**Odebrání videa:** klikněte na **Odebrat video**.

Velké soubory chvíli trvají. Během nahrávání se točí kolečko, počkejte, než
dotočí, a stránku mezitím nezavírejte.

Nakonec klikněte na **Odeslat na displej**.

---

## 8. Přidání, odebrání a přesun slidu

Pod řadou záložek je proužek, který se týká **právě otevřeného slidu**:

```
Slide 2 z 4 · Video · složka 2_vid                              ‹   ›   🗑
```

### Přidání slidu

1. V řadě záložek klikněte na **+ Přidat slide**.
2. Vyberte typ: **Infopanel**, **AI otázky**, **3D model**, **Video**,
   **Zajímavost** nebo **Obecné informace**.
   U každého typu je krátký popis, co na tabletu dělá.
3. Nový slide se přidá **na konec** řady a rovnou se otevře. Odtud ho můžete
   přetáhnout nebo posunout šipkami, kam potřebujete.

### Přesun slidu

Dvě možnosti, obě dělají totéž:

- **Přetažením:** chytněte záložku slidu myší a táhněte ji na jiné místo v řadě.
  Svislá zelená čárka ukazuje, kam se slide pustí; tažená záložka je zesvětlená.
  Když tažení zrušíte (klávesa **Esc** nebo puštění mimo řadu), pořadí zůstane.
- **Šipkami ‹ a ›** vpravo v proužku posunete otevřený slide o jedno místo
  doleva nebo doprava. Šipka je nedostupná, když je slide první, respektive
  poslední.

Číslování slidů se srovná samo, po přesunu zůstáváte na tom samém slidu, jen
s novým číslem.

### Odebrání slidu

Klikněte na **ikonku koše** v proužku. Objeví se potvrzovací okno:

> **Opravdu smazat?** Tato akce je nevratná a smaže obsah slidu z disku,
> slide 2 (Video), složka 2_vid. Fotky, video ani text z tohoto slidu už
> nepůjde vrátit.

Zrušíte ho tlačítkem **Zrušit** nebo klávesou **Esc**, omylem se tedy nic
nesmaže. Po kliknutí na **Smazat slide** se slide smaže **i se všemi fotkami
a videem**, které na něm byly. Zbylé slidy se automaticky přečíslují, aby řada
nikde nechyběla.

---

## 9. Znalostní báze pro chatbota (kb.md)

Znalostní báze je text, ze kterého **AI průvodce (chatbot) odpovídá
návštěvníkům** na dotazy o daném druhu. Otevřete ji oranžovou záložkou
**Znalostní báze (AI)** úplně vpravo v řadě záložek. (Stejně se tam dostanete
z AI slidu tlačítkem **Otevřít znalostní bázi (AI)**.)

Znalostní báze je **jedna pro celý displej**, ne pro jednotlivé slidy.

### Šablona

U nového druhu, kde ještě žádný text není, se editor **sám předvyplní
šablonou**, připraveným rozvržením s nadpisy a nápovědami. Šablonu si můžete
vložit i kdykoliv později tlačítkem **Vložit šablonu** vpravo nad textovým
polem. Pokud už v poli něco máte, systém se nejdřív zeptá, jestli to opravdu
chce přepsat.

> Šablona se do souboru zapíše až ve chvíli, kdy kliknete na **Uložit
> znalostní bázi**. Existující vyplněný text vám nikdy nic nepřepíše samo.

### Co šablona obsahuje

Šablona má tyhle sekce (nadpisy nechte, jak jsou, jen pod ně pište obsah):

| Sekce | Co do ní patří |
|---|---|
| **Popis** | Jak druh vypadá, jak je velký, čím je nápadný. |
| **Potrava** | Čím se živí ve volné přírodě a čím u nás. |
| **Habitat a výskyt** | Kde žije, země, oblast, typ prostředí, podmínky. |
| **Chování** | Denní/noční aktivita, sociální chování, komunikace. |
| **Rozmnožování** | Období, námluvy, kladení vajíček, péče o mláďata. |
| **Zajímavosti** | To, co si návštěvník odnese. Klidně po bodech. |
| **Ohrožení a ochrana** | Zda je druh ohrožený, čím, a jak se chrání. |
| **V naší expozici** | Konkrétně k našim jedincům, kolik jich je, kdy je nejlépe vidět. |

Nahoře v šabloně je i krátký návod „Jak to funguje", ten před uložením klidně
smažte, do znalostní báze pro chatbota nepatří.

### Šest zásad, jak psát dobrou znalostní bázi

1. **Pište pro laika, ne odborně.** Tón si chatbot přizpůsobí sám podle toho,
   jestli se ptá dítě, nebo dospělý. Vy dodáváte fakta.
2. **Jedna myšlenka = jeden odstavec.** Krátké odstavce chatbot lépe najde než
   dlouhé bloky textu.
3. **Fakta konkrétně.** „Dožívá se 10 až 15 let" je lepší než „žije poměrně dlouho".
4. **Nadpisy neměňte.** Pomáhají chatbotovi najít správnou pasáž.
5. **Co nevíte, nevymýšlejte.** Chatbot odpovídá **jen** z tohoto textu. Co tu
   není, o tom neřekne, a raději přizná, že to neví, než aby si vymyslel.
6. **Nemusíte vyplnit všechny sekce.** Když k druhu není co dodat, sekci klidně
   vynechte. Ale čím víc kvalitního obsahu, tím lepší odpovědi.

### Uložení

Klikněte na **Uložit znalostní bázi**. Objeví se potvrzení „Znalostní báze
uložena".

Znalostní báze se **neodesílá tlačítkem na displej**, je to podklad pro
chatbota, ne obsah slidu.

---

## 10. Uložení a odeslání na displej

Systém rozlišuje tři věci a je dobré vědět, která se ukládá kdy:

| Co měníte | Kdy se to uloží |
|---|---|
| **Fotky, video, přidání/odebrání/přesun slidu** | **Hned.** Jakmile akce doběhne, je zapsaná na disku. |
| **Pole info panelu** (Sekce, Název, Strava…) | Až kliknutím na **Uložit a odeslat na displej**. |
| **Znalostní báze (kb.md)** | Až kliknutím na **Uložit znalostní bázi**. |

Takže: **napsaný text, který jste neuložili, se ztratí**, když stránku zavřete
nebo přejdete na jiný displej. Fotky a videa ne, ty jsou uložené hned.

### Tlačítko „Uložit a odeslat na displej"

Na info panelu je jedno tlačítko, které dělá obojí najednou: uloží vyplněná
pole a hned potom pošle displeji pokyn, aby si obsah načetl znovu. Po úspěchu
se vpravo nahoře objeví zelená hláška „Uloženo a odesláno na displej 1".

Když systém upravil latinský název do kanonického tvaru, dozvíte se to
v téže hlášce.

### Tlačítko „Odeslat na displej"

U 3D modelu a videa je samostatné tlačítko **Odeslat na displej**, snímky
a videa už uložené jsou, tímhle jen dáte displeji vědět, aby se obnovil.
U zajímavosti tlačítko **Uložit a odeslat na displej** uloží text a rovnou
displej obnoví.

Každé odeslání se zapíše do audit logu.

---

## 11. Náhled tabletu

V pravém horním rohu detailu displeje je tlačítko **Náhled tabletu**. Otevře
se v nové záložce a ukáže přesně to, co uvidí návštěvník u expozice.

V náhledu:

- slidy se **samy přepínají** zhruba po 8 sekundách (u videa se čeká, až
  dohraje),
- **kliknutím do plochy** přehrávání pozastavíte; dole se objeví „Pozastaveno ·
  klikněte pro pokračování". Dalším kliknutím se rozjede zas,
- **velké šipky** po stranách přepínají slidy, malé šipky dole uvnitř fotky
  přepínají fotky v rámci jednoho slidu,
- ovládat jde i **šipkami na klávesnici**,
- **tečky dole** ukazují, kolikátý slide běží; kliknutím na tečku skočíte přímo
  na slide,
- **ikonka obnovení** vpravo nahoře načte obsah znovu z disku, hodí se, když
  jste zrovna v CMS něco změnili a chcete výsledek vidět,
- **křížek** vpravo nahoře náhled zavře a vrátí vás do editace displeje.

---

## 12. Deštný prales, prostředí a bouřka

Displej u deštného pralesa je jiný než ostatní. Neukazuje informace o druhu,
ale **stav prostředí v pavilonu** a **odpočet do další bouřky** z videomappingu.
Nastavuje se proto na vlastní stránce: v levém menu **Deštný prales**.

Ostatních displejů se tahle stránka nijak netýká a nic v nich nemění.

### Co se nastavuje

| Pole | Kde se to na displeji projeví |
|---|---|
| **Vnitřní teplota** | teplota uvnitř pavilonu vedle vlhkosti. Neměří se, zadáváte ji ručně. |
| **Vlhkost** | údaj o vlhkosti. Je to **text**, ne číslo, takže smí být i rozsah („80-100%"). |
| **Záložní venkovní teplota** | jen pro nouzi, viz níž. Za normálního provozu se nikde neukáže. |
| **Odpočet do bouřky** (přepínač) | vypnutý odpočet displej neukazuje. |
| **Bouřka každých… (minut)** | jak často se bouřka opakuje. |
| **Blikající světla** (přepínač) | varování před blikajícími světly. |
| **Vodní efekty** (přepínač) | varování před vodními efekty (u bouřky se doopravdy rozprašuje voda). |

Desetinná čísla jde psát s čárkou i s tečkou, obojí systém přijme.

### Odpočet do bouřky

Zadáváte jen interval, třeba 15 minut. Zbytek si systém dopočítá sám a cyklus
se pořád opakuje.

Bouřky jedou v **pevném rastru od půlnoci**: při intervalu 15 minut padnou na
0:15, 0:30, 0:45, 1:00 a tak dál. Pod polem je vidět, na jaké časy interval
vyjde. Je to schválně: když se server v pavilonu restartuje, odpočet naváže
tam, kde má být, a nerozejde se s videomappingem.

Odpočet jde **vypnout** přepínačem. Nastavený interval přitom zůstane uložený,
takže se dá kdykoli zapnout zpátky, aniž byste ho psali znovu.

### Venkovní teplota

Venkovní teplotu **nenastavujete**, stahuje si ji systém sám z internetu pro
Ostravu, nejvýš jednou za deset minut. V rámečku nad polem je vidět, jaká
hodnota se zrovna posílá, jestli přišla z internetu, nebo je to záloha, a kdy
naposledy se ji podařilo stáhnout.

**Záložní venkovní teplota** je pojistka pro výpadek internetu. Použije se jen
tehdy, když se skutečnou teplotu nepodařilo stáhnout ani jednou (typicky po
restartu serveru bez internetu). Když internet vypadne později, displej zatím
ukazuje **poslední známou** hodnotu; rámeček vás upozorní, když je starší než
hodina.

Nastavte ji na hodnotu, která je pro roční období věrohodná, ať displej při
výpadku neukazuje nesmysl.

### Náhled vpravo

Vpravo je vidět **přesně to, co displeji zrovna posíláme**, včetně odpočtu,
který běží. Obnovuje se každých pět sekund, stejně jako se ptají tablety.

Náhled ukazuje **uložený** stav. Dokud změny neuložíte, jsou vidět jen ve
formuláři vlevo a displej o nich neví, což píše i text u tlačítka **Uložit
nastavení**. Po uložení si displej nové hodnoty vezme do pěti sekund, nic se
nikam neodesílá ručně.

Tlačítkem **Zahodit změny** se vrátíte k naposledy uloženému stavu.

Každá uložená změna se zapíše do audit logu i s tím, co se změnilo z čeho na
co ([kapitola 14](#14-audit-log--kdo-co-změnil)).

---

## 13. Videomapping, zapnutí a vypnutí

V levém menu je položka **Videomapping**. Jsou tam dvě instalace, tak jak je
znáte z pavilonu:

- **WaterSense**
- **Les**

U každé je tlačítko **Zapnout** a **Vypnout**. Kliknutím se instalaci pošle
povel, o zbytek se postará sama.

### Co vám systém řekne a co ne

**CMS nepozná, jestli mapping opravdu běží.** Povel se posílá jednosměrně a
instalace na něj neodpovídá, takže systém umí potvrdit jen to, že povel
**odeslal**, a kdy. Proto nikde nenajdete nápis „zapnuto“ ani kontrolku stavu.

Po kliknutí se pod tlačítky objeví například:

```
NAPOSLEDY ODESLÁNO Z CMS
Odeslán povel k zapnutí dnes v 13:17:55, uživatel novakova.
```

Jestli se mapping rozeběhl, se pozná **jen pohledem do pavilonu**. Když si
nejste jistí, klidně tlačítko zmáčkněte znovu, opakovaný povel nevadí.

### Když se něco pokazí

Když se povel nepodaří odeslat **od nás** (nefunguje síť, firma změnila adresu
počítače), ukáže se u instalace červené hlášení **„Povel se nepodařilo
odeslat“** i s důvodem. V takovém případě se k instalaci nedostal a je potřeba
volat správce.

Pozor: **žádná chyba ještě neznamená, že povel dorazil.** Znamená jen, že
odešel z našeho serveru. Když se mapping nerozeběhne a přitom se nezobrazila
chyba, je problém na straně instalace nebo sítě v pavilonu.

### Zápis do audit logu

Každé zmáčknutí tlačítka se zapíše do audit logu i s vaším jménem, časem,
povelem a instalací, a to **i když se odeslání nepovede**
([kapitola 14](#14-audit-log--kdo-co-změnil)). Přehled „naposledy odesláno“ na
stránce platí od posledního spuštění serveru, úplná historie je v audit logu.

---

## 14. Audit log, kdo co změnil

V levém menu klikněte na **Audit log**. Je to seznam všech akcí v systému,
nejnovější nahoře: čas, uživatel, akce a čeho se týkala.

Zaznamenává se mimo jiné: přihlášení a odhlášení, **neúspěšné pokusy
o přihlášení**, úpravy info panelu i znalostní báze, nahrání a mazání fotek a
videí, označení mapy výskytu, přidání, odebrání a přesun slidů, odeslání na
displej, změny nastavení deštného pralesa a povely videomappingu.

Záznamy se jen přidávají, nedají se smazat ani přepsat. Tlačítkem **Obnovit**
vpravo nahoře si vyžádáte čerstvý výpis.

---

## 15. Časté otázky a drobné potíže

**Systém mě vyhodil na přihlašovací stránku.**
Vypršelo dvanáctihodinové přihlášení. Přihlaste se znovu. Rozepsaný a neuložený
text bohužel obnovit nejde, proto ukládejte průběžně.

**Nejde uložit info panel, pole svítí červeně.**
Chybí **Sekce** nebo **Název**. Sekci vybírejte z rozbalovacího seznamu, vlastní
text do ní napsat nejde.

**Displej se v seznamu jmenuje „Nepřiřazeno".**
Ještě nemá vyplněný info panel. Otevřete ho, vyplňte Sekci a Název a uložte,
název se hned objeví i na dlaždici.

**Fotka se nenahrála.**
Systém přijímá běžné obrázky (JPG, PNG). Fotky z iPhonu ve formátu HEIC nemusí
projít, v takovém případě je před nahráním převeďte na JPG (v aplikaci Fotky
přes Exportovat, nebo je pošlete e-mailem, což je převede samo).

**Video se nenahrálo.**
Musí být **MP4**. Formáty MOV, AVI nebo MKV systém odmítne, je potřeba je
nejdřív převést.

**Smazal/a jsem něco omylem.**
Smazané fotky, videa i celé slidy se vrátit nedají. Napište správci systému,
možná půjde obsah obnovit ze zálohy.

**Text ze znalostní báze se neobjevil na tabletu.**
A neobjeví. Znalostní báze je podklad pro **chatbota**, ne text slidu. Co má
vidět návštěvník na obrazovce, patří do info panelu, zajímavosti nebo videa.

**Přehled provozu píše „Analytika chatbota zatím není připojená".**
Čísla o dotazech návštěvníků dodává chatbot. Když jeho služba neběží (nebo ještě
není nasazená), stránka to takhle napíše místo čísel, není to chyba a zbytek
CMS to nijak neomezuje. Až chatbot pojede, čísla se objeví sama; stačí kliknout
na **Obnovit**.

**V Přehledu provozu není vidět, který tablet je zapnutý.**
Schválně. Živý stav zařízení v pavilonu systém zatím nemá odkud číst, takže ho
neukazuje, dřív tam bylo jen ukázkové barvení, které mohlo mást. Proužek dole
je přehled displejů založených v CMS: barevně odlišuje jen to, jestli má displej
přiřazený druh, nebo je zatím **Nepřiřazeno**.

**Druh mi chybí v mapě dotazů.**
Dotazy se na displej párují podle **latinského názvu**. Když se druh z chatbota
nespojí s žádným displejem, systém ho vypíše pod mapou, zkontrolujte pole
**Latinský název** v info panelu (i drobná odchylka v pravopisu stačí).

**Potřebuju změnit heslo nebo nový účet pro kolegu.**
To dělá správce systému, v CMS to zatím nejde.
