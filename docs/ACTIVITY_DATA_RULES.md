# Activity and video data rules

## Must preserve current age-group differences

Each squad keeps its current activities and videos:

- 2014 Boys
- 2015 Girls
- 2017 Boys
- 2017 Girls

These will live in:

```txt
src/data/weeklyPlans/
  2014-boys.js
  2015-girls.js
  2017-boys.js
  2017-girls.js
```

## Friday Night Hurling

Friday Night Hurling only appears for:

- 2014 Boys
- 2015 Girls

It must not appear for:

- 2017 Boys
- 2017 Girls

This is controlled by:

```js
showFridayNightHurling: true | false
```

in `src/config/squads.js`.

## Wording

Use `child` instead of `son/daughter` everywhere.
