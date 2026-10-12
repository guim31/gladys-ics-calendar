# ICS-Kalender

Hol jeden Kalender, der im iCalendar-Format veröffentlicht ist (eine `.ics`-Adresse), in Gladys: deinen
Google-Kalender über seine geheime Adresse, einen veröffentlichten Outlook- oder iCloud-Kalender, den
Stundenplan deines Kindes, den Abfuhrkalender deiner Gemeinde, die Spiele deines Vereins, die Feiertage…
Jede Adresse wird zu einem Kalender in der Ansicht **Kalender** von Gladys, wird aktuell gehalten und lässt
sich in Szenen nutzen wie die Kalender, die Gladys selbst synchronisiert.

- **Jeder Benutzer fügt seine eigenen Kalender hinzu**, im Block **Meine Kalender** auf der Seite der
  Integration: bis zu fünf Adressen pro Person. Die Kalender bleiben privat, bis ihr Besitzer sie mit dem
  Haushalt teilt.
- **Wiederkehrende Termine** (jeden Montag, jeden ersten Dienstag im Monat…), Ausnahmen, verschobene oder
  abgesagte Termine, ganztägige Termine und Zeitzonen (auch die von Outlook und Exchange) werden
  unterstützt.
- Ein **Dashboard-Widget**, zwei **Szenen-Auslöser** (ein Termin geändert, ein Kalender nicht erreichbar)
  und eine **Szenen-Aktion** (den nächsten Termin finden) ergänzen, was Gladys schon bietet.

> Getestet mit der automatischen Testsuite und mit echten Kalenderdateien (Google, Apple, Outlook,
> französisches Bildungsministerium), aber noch kaum auf echten Gladys-Instanzen: Rückmeldungen sind im
> Gladys-Forum oder in den GitHub-Issues willkommen.

## Was du brauchst

- Gladys Assistant 5.2.0 oder neuer.
- Die `.ics`-Adresse jedes Kalenders (siehe unten). Kein Konto, kein API-Schlüssel.
- Internetzugang von Gladys aus, um die Kalender herunterzuladen.

## Installieren und Kalender hinzufügen

1. Installiere die Integration: **Integrationen → Von GitHub installieren**, Adresse
   `https://github.com/guim31/gladys-ics-calendar`.
2. Öffne ihre Seite. Jeder Benutzer von Gladys, nicht nur der Administrator, sieht dort den Block **Meine
   Kalender**.
3. Füge bis zu fünf Adressen ein, jede mit einem optionalen Namen (sonst wird der Name aus der Datei
   übernommen), und klicke auf **Für mich aktivieren**. `webcal://`-Adressen werden so übernommen, wie sie
   sind.
4. Nach ein paar Sekunden erscheinen deine Kalender unter dem Formular. Für jeden:
   - **Diesen Kalender synchronisieren**: ausschalten, um ihn nicht mehr herunterzuladen (seine Termine
     werden aus Gladys entfernt);
   - **Mit dem Haushalt teilen**: der Kalender wird für alle sichtbar, **und erst dann** kann er Szenen
     auslösen und im Dashboard-Widget erscheinen.

Die Adressen werden als Geheimnisse gespeichert: Gladys zeigt sie nie wieder an. Um eine zu ändern, gib die
neue Adresse in ihr Feld ein und speichere: ein neuer Kalender wird angelegt (privat, wie jeder neue
Kalender) und der alte gelöscht. Um einen Kalender zu entfernen, tippe ein Zeichen in sein Adressfeld, lösche
es wieder und speichere.

### Wo du die .ics-Adresse findest

- **Google Kalender**: am Computer **Einstellungen → Einstellungen für meine Kalender →** dein Kalender **→
  Kalender integrieren → Geheime Adresse im iCal-Format**. Diese Adresse gibt Lesezugriff auf deinen ganzen
  Kalender: behalte sie für dich. Ein öffentlicher Kalender hat auch eine **Öffentliche Adresse im
  iCal-Format**.
- **Outlook / Microsoft 365**: **Einstellungen → Kalender → Freigegebene Kalender → Kalender
  veröffentlichen**, wähle den Kalender und „Kann alle Details anzeigen“, dann kopiere den **ICS**-Link.
- **iCloud**: teile den Kalender in der Kalender-App als **Öffentlichen Kalender** und kopiere seinen Link
  (`webcal://…`).
- **Schulportale, Gemeinden, Vereine**: suche nach „Exportieren“, „Abonnieren“, „iCal“ oder „ICS“. Viele
  Schul- und Stundenplanportale bieten einen iCal-Export an, wenn die Schule ihn freigeschaltet hat.
- **Nextcloud und andere Server mit Passwort**: schreib es in die Adresse,
  `https://benutzer:passwort@server/…`; es wird als normale Anmeldung gesendet.

## Einstellungen des Administrators

Im Reiter **Konfiguration**, für alle Benutzer:

- **Herunterladen alle**: 15, 30 oder 60 Minuten (standardmäßig 30). Ein unveränderter Kalender kostet fast
  nichts: die Integration fragt den Server, ob sich die Datei geändert hat, lädt sie nur dann herunter, und
  einmal am Tag vollständig.
- **Termine anzeigen bis**: wie weit wiederkehrende Termine vorausberechnet werden, 3 bis 24 Monate
  (standardmäßig 12). Termine, die älter als 90 Tage sind, werden aus Gladys entfernt.
- **Änderungen beobachten über (Tage)**: der Horizont des Auslösers „Termin geändert“ (standardmäßig 7 Tage).
- **Nicht erreichbar nach (Stunden)**: die Wartezeit vor dem Auslöser „Kalender nicht erreichbar“
  (standardmäßig 6 Stunden).
- **Sprache der Szenentexte**: die an Szenen übergebenen Daten und Bezeichnungen und der Name von Terminen
  ohne Titel.

Die Schaltfläche **Jetzt synchronisieren** lädt sofort alle Kalender herunter und sagt, welche
fehlgeschlagen sind und warum.

## In Gladys

Die Kalender erscheinen in der Ansicht **Kalender** wie die anderen, mit eigener Farbe. Alles, was Gladys mit
seinen Kalendern macht, funktioniert mit ihnen, sobald sie **geteilt** sind:

- der Auslöser **Kalenderereignis steht bevor** (zum Beispiel 15 Minuten vor dem Beginn eines Termins, dessen
  Name „Gelber Sack“ enthält);
- die Aktionen **Bedingung für Kalenderereignisse** und **Kalenderereignisse abrufen** (heute, morgen, die
  nächsten Stunden);
- der Kalender-Chip des Dashboards und der Assistent.

Gladys schreibt nie in deine Kalender: ein in Gladys angelegter oder geänderter Termin bleibt in Gladys; der
nächste Download bringt wieder den Inhalt des Originalkalenders.

## Dashboard-Widget

**Nächste Termine** listet die Termine der geteilten Kalender auf (höchstens acht): heute, morgen, dann die
folgenden Tage, mit der Uhrzeit, und dem Namen des Kalenders, wenn mehrere angezeigt werden. Tippe auf einen
Termin, um Ort und Beschreibung zu lesen und seinen Link zu öffnen.

- **Kalender**: Namen geteilter Kalender, durch Kommas getrennt; leer für alle.
- **Zeitraum**: heute, 3, 7, 14 oder 31 Tage.

Ein Kalender, der sich nicht mehr herunterladen lässt, erscheint rot; die Schaltfläche **Synchronisieren**
lädt alles neu.

## Szenen-Auslöser

Beide Auslöser betreffen nur **geteilte** Kalender. Der Filter **Kalender** nimmt den genauen Namen eines
Kalenders (leer: jeder).

### Termin in einem Kalender geändert

Löst aus, wenn zwischen zwei Downloads ein Termin der nächsten Tage (standardmäßig 7) **hinzugefügt**,
**abgesagt**, **verschoben** oder **umbenannt oder an einen anderen Ort verlegt** wurde. Der Filter
**Änderung** behält nur einige davon. An die Szene übergeben: der Termin, sein Beginn („Dienstag, 13. Oktober,
10:00“), die Tage bis dahin, sein Ort, die Änderung und der Kalender.

Der erste Download nach einem Neustart der Integration dient als Referenz: Änderungen, während sie gestoppt
war, werden nicht gemeldet. Ändern sich mehr als zehn Termine auf einmal (ein neu exportierter Kalender),
löst nichts aus.

### Kalender nicht erreichbar

Löst einmal aus, wenn ein geteilter Kalender seit der eingestellten Stundenzahl nicht heruntergeladen werden
konnte (ein abgelaufener Link, eine in Google neu erzeugte Adresse, ein ausgefallener Server). Übergeben: der
Kalender, sein Besitzer, der Fehler und die vergangenen Stunden. Er löst erst wieder aus, wenn der Kalender
zurück war.

## Szenen-Aktion „Nächsten Kalendertermin finden“

Sucht den nächsten Termin der geteilten Kalender, dessen Titel einen Text enthält (Groß- und
Kleinschreibung und Akzente werden ignoriert), egal wie weit entfernt, laufende Termine eingeschlossen.
Optionaler Filter **Kalender**. Ergebnisse für die folgenden Schritte: Termin gefunden (1 ja, 0 nein), Termin,
Beginn, Tage bis zum Termin (0 heute, -1 wenn nichts gefunden wurde), Ort und Kalender.

## Beispielszenen

- **Müllabfuhr**: Auslöser **Zeitabhängiger Auslöser** jeden Abend um 19:00, Aktion **Nächsten
  Kalendertermin finden** mit „gelber sack“, Bedingung „Tage bis zum Termin = 1“, dann **Nachricht senden**
  „Stell heute Abend den Gelben Sack raus“.
- **Ausgefallene Stunde**: Auslöser **Termin in einem Kalender geändert** auf dem Kalender „Schule“,
  Änderung „Abgesagt“, dann **Nachricht senden** „{{Termin}} am {{Beginn}} fällt aus“.
- **Abgelaufener Link**: Auslöser **Kalender nicht erreichbar**, dann **Nachricht senden** „Der Kalender
  {{Kalender}} von {{Besitzer}} lädt nicht mehr: {{Fehler}}“.

## Fehlerbehebung

- **Mein Kalender erscheint nicht unter dem Formular**: die Adresse ist falsch oder der Server lehnt sie ab.
  Der Administrator sieht den Grund mit **Jetzt synchronisieren** und in den Logs der Integration (dort ist
  die Adresse auf den Servernamen gekürzt).
- **„Die Adresse liefert keine iCalendar-Datei“**: der Link führt auf eine Webseite (eine Anmeldeseite, eine
  HTML-Freigabeseite). Kopiere den Link für Kalender-Apps (iCal, ICS, webcal).
- **HTTP 404 bei einem Google-Kalender**: die geheime Adresse wurde in Google zurückgesetzt; füge die neue
  ein.
- **Der Kalender ist weder im Widget noch in den Szenen**: teile ihn unter **Meine Kalender** mit dem
  Haushalt.
- **Die Termine sind um eine Stunde verschoben**: prüfe die Zeitzone von Gladys (**Einstellungen → System**);
  die Integration nutzt sie für die Daten.
- **Eine Änderung braucht lange**: Google aktualisiert seine geheimen Adressen selbst, manchmal nur alle paar
  Stunden; mit **Jetzt synchronisieren** prüfst du die Seite der Integration.

## Grenzen

- Nur lesend: Gladys schreibt nie in den Originalkalender.
- Fünf Kalender pro Benutzer, 9.000 Termine pro Kalender (darüber werden die ältesten vergangenen Termine
  weggelassen), Termine von höchstens 90 Tagen zurück bis 24 Monate voraus.
- Eine Kalenderdatei über 20 MB oder ein Server, der länger als 30 Sekunden braucht, wird abgelehnt.
- Der Kern von Gladys nimmt 30 Kalender-Schreibvorgänge pro Minute an: mit vielen großen Kalendern dauert die
  erste Synchronisierung ein paar Minuten.
- Kalender, die eine andere Anmeldung als ein Passwort in der Adresse brauchen (Google- oder
  Microsoft-Konten per OAuth), werden nicht unterstützt: nutze ihre veröffentlichte (`.ics`) Adresse.
- Änderungen eines Termins werden beim nächsten Download gesehen: der Auslöser ist so schnell wie
  **Herunterladen alle**.

## Datenschutz und Sicherheit

- Die Adressen sind Geheimnisse, die Gladys im Konto jedes Benutzers speichert; die Integration behält keine
  davon auf der Festplatte, schreibt keine in ihre Logs (nur den Servernamen) und erkennt die Kalender an
  einem nicht umkehrbaren Hash.
- Die Integration speichert in ihrem Volume `/data` nur, seit wann jeder Kalender fehlschlägt (weder Adresse
  noch Termin).
- Private Kalender bleiben bei ihrem Besitzer: Widget und Szenen sehen nur die geteilten.

## Danksagung

Lesen der iCalendar-Dateien: [node-ical](https://github.com/jens-maus/node-ical) (Apache-2.0). Testdateien
aus node-ical, aus [ical](https://github.com/allenporter/ical) von Allen Porter und aus
[Home Assistant](https://github.com/home-assistant/core) (Apache-2.0), dessen Integration Remote Calendar
diese inspiriert hat. Nicht verbunden mit Google, Microsoft, Apple, Index Éducation oder Home Assistant.
