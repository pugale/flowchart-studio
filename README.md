# Flowchart Studio 1.0

Editor di diagrammi di flusso: **TypeScript + maxGraph + Vite**, versione desktop con **Electron**
(programma di installazione e exe portabile).
Autore: **Alessandro Puglisi** – alessandro.puglisi@eng.it

## Funzioni principali
- Palette a sinistra con 15 forme, **freccia libera** e **corsie orizzontali o verticali**
- **Collegamenti** tra forme dai 4 punti di ancoraggio (punti blu)
- **Testo** nelle forme, modificabile con doppio clic o dal pannello a destra, con **maiuscole/minuscole**
- **Colori** di sfondo, bordo e testo; font, dimensione, grassetto, corsivo, allineamento
- **Corsie / gruppi** con nome, colori, tipo di bordo e orientamento; si allargano da sole e restano sempre sotto le forme
- **Legenda automatica** raggruppata per colore di sfondo, con descrizioni; si può nascondere
- **Diagramma da testo** (Ctrl+I): descrivi il processo a parole e il diagramma si disegna da solo
- **Pannelli laterali nascondibili**, sfondo personalizzabile, griglia, zoom, annulla/ripeti, copia/incolla
- Salvataggio in **JSON**, esportazione **PDF** e **JPG**
- Icona, **schermata di avvio** e **manuale** integrato (pulsante **?** o F1)

## Barra in alto
| Elemento | Contenuto |
|---|---|
| **File ▾** | Nuovo diagramma · Apri… (Ctrl+O) |
| Salva / Salva come… / ✎ Da testo | pulsanti diretti |
| ↶ ↷ Raggruppa Elimina | modifica |
| **Esporta ▾** | PDF · JPG |
| − 100% + Adatta | zoom |
| Griglia · Legenda · Sfondo | vista |
| **◧ ◨** | mostra / nascondi palette (sinistra) e pannello impostazioni (destra) |
| **?** | manuale (F1) |

## Requisiti
- **Node.js 26.12.1** (versione indicata nel file `.nvmrc`)
- Visual Studio Code
- Windows per creare setup e portabile

## Aprire il progetto in Visual Studio Code
1. Estrai lo zip in una cartella locale (es. `C:\Progetti\`), non sincronizzata con OneDrive.
2. VS Code → **File → Apri cartella…** → `flowchart-studio` → "Ritieni attendibili gli autori?" → **Sì**.
3. Installa le estensioni consigliate quando VS Code le propone.
4. Terminale → Nuovo terminale:
```
npm install
npm test             # 40 test superati
npm run dev          # versione web: http://localhost:5173
npm run app          # versione desktop in finestra Electron
```
In VS Code puoi anche premere **F5** → "Web: debug in Edge" oppure "Desktop: Electron".

### Messaggi di `npm install`
| Messaggio | Cosa fare |
|---|---|
| `npm warn deprecated …` (inflight, rimraf, glob, boolean) | Nulla: dipendenze interne degli strumenti di build, non finiscono nell'app |
| `… moderate severity vulnerabilities` | **Non** eseguire `npm audit fix --force`. Controlla con `npm audit` se riguardano jspdf, svg2pdf.js, dompurify o @maxgraph/core |
| `install-scripts … electron-winstaller, core-js` | Nulla: non servono (usiamo NSIS e portable) |
| Electron non installato correttamente con `npm run app` | `npm install-scripts approve electron` e poi `npm install` |
| `npm.ps1 cannot be loaded… execution policy` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, oppure usa il terminale **Command Prompt** |
| `Unsupported engine` | Installa Node.js 26.12.1 o una versione successiva |
| `No matching version for @maxgraph/core@~0.25.0` | In `package.json` usa `~0.24.0` e rilancia `npm install` |

## Comandi
| Comando | Cosa fa |
|---|---|
| `npm run dev` | sviluppo nel browser con ricarica istantanea |
| `npm test` | test automatici della logica |
| `npm run typecheck` | controllo dei tipi |
| `npm run build` | controllo tipi + build web in `dist/` |
| `npm run app` | build + apertura in Electron |
| `npm run dist:setup` | `release/FlowchartStudio-1.0.0-setup.exe` |
| `npm run dist:portable` | `release/FlowchartStudio-1.0.0-portable.exe` |
| `npm run dist` | setup + portabile |

## Struttura
```
src/
  core/              logica pura, senza maxGraph (coperta dai test)
    types.ts           formato del file JSON
    styles.ts          forme, colori, stili di forme/corsie/frecce, maiuscole/minuscole, orientamento corsie
    textImport.ts      lettura del testo + impaginazione automatica
    docIO.ts           lettura e validazione dei file JSON
    legendLayout.ts    impaginazione della legenda
    laneStack.ts       corsie senza sovrapposizioni (orizzontali impilate, verticali affiancate)
    zorder.ts          ordine di disegno (corsie sempre sotto)
  editor/            tutto ciò che usa maxGraph
    FlowEditor.ts      configurazione, documento, azioni, frecce libere, orientamento corsie, salvataggio automatico
    lanes.ts           corsie che si allargano da sole
    legend.ts          legenda automatica
    cells.ts           utilità sulle celle
    shapes.ts          forme personalizzate e disegno della legenda
    text.ts            misura e a capo del testo (con cache)
    exporter.ts        JPG e PDF (caricato solo quando serve)
  ui/                palette, pannello proprietà, finestra "Da testo", file
  examples/          esempio "Canali richiesta" (JSON e testo)
  env.d.ts           tipi globali (versione dell'app)
  main.ts            avvio, splash, menu, pannelli, manuale, tastiera
public/
  manuale.html       manuale d'uso (pulsante ? / F1)
  favicon…           icone della versione web
tests/core.test.ts   test automatici
electron/main.cjs    finestra desktop
electron/splash.html schermata di avvio della versione desktop
build/               icona dell'app (icon.svg, icon-small.svg, icon.ico, icon.png)
```

La cartella `core` contiene la "logica senza maxGraph": regole del diagramma, formato dei file,
import da testo, legenda e disposizione delle corsie. Si verifica con `npm test` senza browser.

## Corsie orizzontali e verticali
| Orientamento | Aspetto | Più corsie |
|---|---|---|
| Orizzontale (`laneDir: "h"`) | larga, nome nella banda a sinistra | impilate dall'alto in basso |
| Verticale (`laneDir: "v"`) | alta, nome nella banda in alto | affiancate da sinistra a destra |

- Dalla palette: **Corsia orizzontale** / **Corsia verticale**. Ctrl+G crea una corsia orizzontale.
- Nel pannello, **Orientamento** cambia il tipo: la corsia ruota (larghezza ↔ altezza) e le forme
  interne scambiano x e y, così la banda del nome non le copre.
- Se una forma esce dal bordo la corsia si allarga: le orizzontali sotto scendono, le verticali a destra
  si spostano; le corsie allineate restano allineate.
- Le corsie stanno sempre **sotto** forme, collegamenti, frecce libere e legenda.

## Esportazione PDF
1. Prima viene creato il **PDF vettoriale** (jsPDF + svg2pdf.js). L'SVG viene adattato: tolte le aree
   invisibili che maxGraph usa per i clic, sostituito "transparent", font convertiti in quelli standard
   del PDF (Helvetica, Times, Courier).
2. Se la conversione vettoriale non riesce (o supera 30 s), viene creato un **PDF con l'immagine** del
   diagramma ad alta risoluzione (~216 dpi): il PDF viene quindi sempre prodotto e un messaggio lo segnala.
3. Il file viene scaricato con lo stesso meccanismo del JPG (funziona anche in Electron).

L'eventuale errore della versione vettoriale è scritto nella console (F12) per l'analisi.

## Pannelli laterali
I pulsanti **◧** e **◨** nascondono la palette e il pannello delle impostazioni; la dashboard occupa lo
spazio liberato. La scelta è ricordata alla riapertura (chiave `flowchart-studio:layout`).

## Testo delle forme
- Doppio clic sulla forma oppure campo **Testo** del pannello: la forma si aggiorna mentre scrivi.
- **Maiuscole / minuscole**: Come scritto · TUTTO MAIUSCOLO · tutto minuscolo · Solo prima lettera maiuscola.
  Cambia solo la visualizzazione (anche in PDF/JPG); il testo originale resta salvato (`textCase` nello stile).

## Frecce: collegamenti e frecce libere
| Tipo | Come si crea | Comportamento |
|---|---|---|
| **Collegamento** | da un **punto blu** di una forma a un'altra forma | resta agganciato; rilasciato nel vuoto crea una nuova forma |
| **Freccia libera** | palette → **Linee** → "Freccia libera" | si sposta, si allunga e si ruota dalle estremità; non si aggancia |

## Diagramma da testo (Ctrl+I)
```
titolo: Gestione richiesta
categoria: auto = Automatico (sistema)

[1 · Ricezione] {blu}
Inizio -> Ricezione richiesta {manuale} -> Registrazione {auto}

[2 · Verifica] {grigio}
Registrazione -> Documenti completi?
Documenti completi? -[sì]-> Istruttoria {manuale}
Documenti completi? -[no]-> Richiesta integrazione {auto} -> Ricezione richiesta
```
Gli esempi pronti si caricano dai pulsanti **Esempio breve** ed **Esempio "Canali richiesta"** della finestra.
Il file `src/examples/canali-richiesta.json` (stesso diagramma, fedele all'immagine di riferimento) si apre con **File → Apri**.

## Formato del file JSON
`{"format":"flowchart-studio","version":1, settings, legend, lanes, nodes, edges}`.
Le coordinate delle forme sono relative alla corsia; l'orientamento della corsia è `laneDir` nel suo stile.
Ogni estremo di un collegamento è agganciato a una forma (`source`/`target`) oppure libero
(`sourcePoint`/`targetPoint`). All'apertura il file viene validato; file di altri programmi o di
versioni diverse vengono rifiutati.

## Manuale
`public/manuale.html` si apre con **?** o **F1** in una finestra dentro l'app (pulsante Stampa per
stamparlo o salvarlo in PDF). Contiene la sezione Autore. La versione indicata nell'intestazione va
aggiornata a mano al cambio di versione.

## Icona
| File | Uso |
|---|---|
| `build/icon.svg` | disegno originale |
| `build/icon-small.svg` | versione semplificata per 16–32 px |
| `build/icon.ico` | setup, portabile, collegamenti (16–256 px) |
| `build/icon.png` | finestra, barra delle applicazioni, splash (512 px) |
| `public/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | versione web |

Per sostituirla: aggiorna i due SVG e `public/favicon.svg`, poi rigenera PNG e ICO (PowerShell):
```powershell
inkscape build/icon.svg --export-type=png -w 512 -h 512 --export-filename=build/icon.png
inkscape build/icon.svg --export-type=png -w 180 -h 180 --export-filename=public/apple-touch-icon.png
mkdir tmp-icon
foreach ($s in 16,24,32) { inkscape build/icon-small.svg --export-type=png -w $s -h $s --export-filename=tmp-icon/$s.png }
foreach ($s in 48,64,128,256) { inkscape build/icon.svg --export-type=png -w $s -h $s --export-filename=tmp-icon/$s.png }
copy tmp-icon/32.png public/favicon-32.png
magick tmp-icon/16.png tmp-icon/24.png tmp-icon/32.png tmp-icon/48.png tmp-icon/64.png tmp-icon/128.png tmp-icon/256.png build/icon.ico
Remove-Item -Recurse tmp-icon
```
Se Windows mostra ancora la vecchia icona, riavvia Esplora risorse (cache delle icone).

## Schermata di avvio (splash)
Desktop: `electron/splash.html`, chiusa quando l'app è pronta (minimo 1,2 s, `SPLASH_MIN_MS`).
Web: blocco `#splash` in `index.html`, rimosso da `main.ts`. Mostra icona, nome e versione.
Il portabile si scompatta prima di mostrarla (qualche secondo).

## Setup e portabile
| | Setup | Portabile |
|---|---|---|
| Installazione | nella cartella utente, senza amministratore | nessuna |
| Collegamenti desktop / Start | sì | no |
| Dati automatici | `%APPDATA%\Flowchart Studio` | cartella `FlowchartStudio-dati` accanto all'exe |

Senza firma digitale SmartScreen può mostrare un avviso; con un certificato aziendale impostare
`WIN_CSC_LINK` e `WIN_CSC_KEY_PASSWORD` prima di `npm run dist`.

## Scorciatoie
| Tasti | Azione |
|---|---|
| F1 | manuale |
| Ctrl+O | apri |
| Ctrl+S / Ctrl+Maiusc+S | salva / salva con nome |
| Ctrl+Z / Ctrl+Y | annulla / ripeti |
| Ctrl+C / Ctrl+V / Ctrl+D | copia / incolla / duplica |
| Ctrl+A | seleziona tutto |
| Ctrl+G / Ctrl+Maiusc+G | metti in corsia / separa |
| Canc | elimina |
| Ctrl+I | diagramma da testo |
| F2 | modifica testo della forma selezionata |
| Frecce (Maiusc = 10 px) | sposta forme e frecce libere |
| Esc | annulla selezione · chiude menu e finestre |
| Ctrl+rotella · Spazio+trascina | zoom · sposta la vista |
| F12 / Ctrl+R | strumenti di sviluppo / ricarica (solo desktop) |
