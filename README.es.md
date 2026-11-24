# The Grand Continuity — mundo de ejemplo de Everend Forge

<a href="README.md">English</a>

Este repositorio incluye un universo de ejemplo listo para abrir en Everend Forge. La carpeta `universe/` conecta el canon de WorldNotion, la historia ramificada de PathBranching y la edición de lectura de Compendium; las herramientas y dependencias del proyecto quedan fuera del universo.

El mundo reúne, con humor, géneros de fantasía, ciencia ficción, criaturas coleccionables y héroes municipales. El contenido canónico está escrito en inglés; puedes usar la interfaz de las aplicaciones en español.

## Empieza aquí

1. Descarga o clona este repositorio.
2. En Forge Suite, elige la carpeta `universe/` como universo. Las tres aplicaciones usarán esa misma carpeta limpia.
3. Abre **WorldNotion** y empieza por [The-Grand-Continuity.md](universe/The-Grand-Continuity.md). Explora las entidades, la cronología en `Timelines/` y el mapa relacional en `Relationships/`.
4. Abre **PathBranching** para recorrer y editar **The Last Acceptable Reboot**. La historia incluye fichas con atributos, variantes de Tess y Sol, una prueba D20 y seis finales.
5. Abre **Compendium** para leer el canon y su cronología como edición de solo lectura.

Para generar el sitio estático de Compendium desde el repositorio hermano:

```sh
cd ../everend-forge-compendium
npx tsx cli/cli.ts build ../everend-forge-demworld/universe
```

## Qué demuestra

- Un universo compartido con perfil, taxonomía y plantillas de entidades.
- Canon conectado mediante identificadores estables y enlaces entre notas.
- Planificación de historia y escenas en WorldNotion junto con una historia modular en PathBranching.
- Rutas, decisiones, referencias al canon y seis finales en una sola historia.
- Una cronología con calendario propio y un mapa visual de relaciones entre personajes e instituciones.
- Fichas de personajes con atributos numéricos, variantes heredables y una prueba de habilidad con D20.
- Una configuración de publicación de Compendium para el mismo universo.

Los ajustes locales que las aplicaciones creen dentro de `universe/.everend/.worldnotion`, `universe/.everend/.compendium` y `universe/.everend/.pathbranching/.transactions` no forman parte del canon ni se incluyen en Git.

## Licencia y marca

El mundo, las historias, configuraciones y documentación se ofrecen bajo CC BY 4.0. Conserva la atribución e indica los cambios cuando adaptes el contenido. Consulta [LICENSE](LICENSE), el [texto CC BY 4.0](LICENSE-CC-BY-4.0) y la [política de marca](TRADEMARKS.md).
