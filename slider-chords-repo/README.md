# Slider Chords — synthé RNBO pour le web

Interface web pour le patch RNBO "Slider Chords". Structure pensée pour
être hébergée sur GitHub Pages et modifiée facilement, sans tout
regénérer à chaque fois.

## Structure

```
index.html              structure de la page (à ne presque jamais toucher)
style.css                toute l'apparence (couleurs, formes des knobs, layout)
app.js                   logique : chargement RNBO, audio, contrôles, bang
patch/patch_export.json  l'export RNBO (remplaçable)
patch/dependencies.json  dépendances du patch (samples éventuels)
```

## Changer de patch

Il suffit d'écraser les deux fichiers dans `patch/` par un nouvel export
RNBO (Export → Web dans Max/RNBO). Rien d'autre à modifier : les
contrôles (knobs, interrupteurs) sont générés automatiquement à partir
des paramètres déclarés dans le patch, et la version de `@rnbo/js`
chargée correspond automatiquement à celle du patch.

Si les nouveaux paramètres ont des noms différents, ajoute-les dans
l'objet `LABELS` en haut de `app.js` pour leur donner un libellé
français — sinon le nom brut du paramètre RNBO s'affiche.

## Changer l'interface (GUI)

Tout le visuel est dans `style.css`. Pour essayer un autre thème sans
perdre l'actuel :

1. Duplique `style.css` en `style-autre-nom.css`
2. Modifie les couleurs (variables en haut du fichier `:root { ... }`),
   les rayons, les polices, etc.
3. Change la ligne `<link rel="stylesheet" href="style.css">` dans
   `index.html` pour pointer vers ton nouveau fichier

`app.js` ne dépend d'aucune valeur de style — uniquement des noms de
classes (`.knob`, `.toggle`, `.ctrl`, etc.), donc tu peux repenser
entièrement l'apparence sans casser le fonctionnement.

## Déploiement sur GitHub Pages

1. Crée un repo GitHub et pousse ces fichiers à la racine
2. Repo → Settings → Pages → Source : sélectionne la branche
   (généralement `main`) et le dossier `/ (root)`
3. Le site sera servi à `https://<utilisateur>.github.io/<repo>/`

## Test en local

Le chargement du patch se fait via `fetch()`, ce qui ne fonctionne pas
en ouvrant simplement `index.html` avec `file://` (restriction des
navigateurs). Sers le dossier avec un petit serveur local :

```bash
python3 -m http.server
# puis ouvrir http://localhost:8000
```

## Intégration dans un site Figma (ou autre)

Une fois déployé sur GitHub Pages, intègre la page via un `iframe` dans
un bloc Embed (Figma Sites : Insert → Embeds → HTML) :

```html
<iframe src="https://<utilisateur>.github.io/<repo>/"
        width="100%" height="640" style="border:none;" allow="autoplay">
</iframe>
```
