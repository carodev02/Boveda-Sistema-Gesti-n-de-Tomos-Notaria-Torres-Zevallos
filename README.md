# SIGADN

Sistema Inteligente de Gestión y Archivo Documental Notarial para la Notaría Torres Zevallos.

SIGADN busca centralizar, digitalizar, organizar y consultar minutas y registros notariales, reduciendo el registro manual y relacionando los documentos mediante el número de kardex.

## Situación actual

Actualmente, las minutas y los registros notariales se registran manualmente en archivos Excel y se guardan en carpetas. La organización histórica suele seguir una estructura aproximada de tipo de registro, año o bienio, tomo, fojas, contratante y archivo identificado por kardex.

La información está distribuida entre Excel, carpetas, nombres de archivos y documentos escaneados. La búsqueda y validación dependen en gran medida del conocimiento del personal, lo que dificulta encontrar contradicciones y mantener una ubicación uniforme.

## Solución propuesta

SIGADN analiza los archivos existentes y los documentos digitalizados para identificar kardex, relacionar minutas con registros notariales, obtener acto jurídico y contratante principalmente desde la minuta, y organizar la ubicación documental. Los campos dudosos se presentan para revisión, sin modificar los PDF originales.

El kardex es la clave principal de relación:

```text
Compraventa
└── Kardex 333
    ├── Minuta
    └── Registro notarial
```

## Flujo principal

### Escanear documento

Configuración mínima → abrir CZUR → recibir escaneo → procesar hoja → control previo → reconocimiento y extracción posteriores → revisión → archivado posterior.

### Archivos existentes

Seleccionar carpeta y, opcionalmente, Excel → inventario progresivo → lectura de la estructura de carpetas → validación con Excel → análisis documental posterior → revisión de contradicciones → importación de una copia normalizada.

## Datos principales

- **Kardex:** identificador que relaciona documentos del mismo expediente.
- **Minuta:** documento fuente para acto jurídico y contratante principal.
- **Registro notarial:** instrumento formal relacionado con el kardex.
- **Tipo de registro:** escrituras públicas, poderes, testamentos, actas, vehicular u otros catálogos.
- **Acto jurídico:** compraventa, donación, poder especial, hipoteca, entre otros.
- **Tomo, año/bienio y fojas:** datos de ubicación documental.
- **Contratante principal:** persona o entidad principal asociada al kardex.

## Tecnologías y programas

| Tecnología | Función |
|---|---|
| React + TypeScript | Interfaz de usuario. |
| Vite | Desarrollo y compilación del frontend. |
| Tauri | Aplicación de escritorio y acceso controlado al equipo local. |
| Rust | Comandos nativos, sesiones de escaneo, archivos y vigilancia local. |
| Node.js + Express | API, autenticación, permisos y lógica del servidor. |
| PostgreSQL | Base de datos central. |
| Prisma | Cliente, esquema y migraciones de PostgreSQL. |
| Python | Procesamiento documental independiente. |
| OpenCV | Detección de hoja y corrección de perspectiva. |
| PyMuPDF | Lectura y renderizado de PDF. |
| Tesseract | Motor OCR local preparado para procesamiento documental. |
| CZUR | Captura y exportación de documentos físicos cuando la estación esté configurada. |

## Estructura del proyecto

```text
SIGADN/
├── src/                  Frontend React y servicios de interfaz
├── src-tauri/            Aplicación Tauri, comandos Rust y visión Python
├── src-tauri/vision/     Processor Python, entorno virtual y dependencias de visión
├── backend/              API Express, Prisma, migraciones y pruebas
├── server/               Código heredado o auxiliar; revisar antes de reutilizar
├── package.json           Scripts del frontend y Tauri
└── docker-compose.yml      Servicios locales del backend, si se utiliza en la estación
```

## Ejecución

### Frontend en navegador

```bash
npm install
npm run dev
```

El navegador permite probar la interfaz. Las funciones que requieren acceso local, como la estación CZUR, requieren Desktop.

### Backend

```bash
npm --prefix backend install
npm run backend:dev
```

Pruebas y compilación del backend:

```bash
npm run backend:test
npm run backend:build
```

### Aplicación de escritorio

```bash
npm install
npm run tauri:dev
```

Para generar el ejecutable:

```bash
npm run tauri:build
```

## Estado actual de las fases

- **Fase 1:** flujo e interfaz inicial del Centro de Digitalización, modelo documental y revisión diferenciada: terminada y aprobada.
- **Fase 2:** inventario de carpetas, lectura de Excel y validación preliminar: terminada y aprobada.
- **Fase 3:** integración de visión Python/OpenCV, renderizado y generación de PDF limpio preparados; el cierre del recorrido visual completo desde Tauri y la prueba física CZUR aún requieren verificación.
- **Fase 4:** worker y extractores iniciales preparados, pero la integración completa de OCR, QR, KardexCase y revisión documental aún no está cerrada.

No se considera terminada una fase únicamente porque compile: debe cumplir su prueba de aceptación real y conservar los documentos originales.
