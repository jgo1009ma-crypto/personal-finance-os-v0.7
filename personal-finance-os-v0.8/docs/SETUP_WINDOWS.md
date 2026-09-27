# Ejecutar Personal Finance OS v0.6 en Windows

## 1. Requisito

Instala **Node.js 18 o superior**. Después abre PowerShell o CMD y verifica:

```bat
node --version
```

No necesitas instalar paquetes npm para ejecutar la versión compilada incluida.

## 2. Descomprime el ZIP

Por ejemplo:

```text
C:\Users\TuUsuario\Documents\personal-finance-os\
```

## 3. Inicia la app

Haz doble clic en:

```text
run-app.cmd
```

Mantén esa ventana abierta y visita:

```text
http://localhost:8787
```

Los datos locales se crearán en:

```text
data\user-data.json
```

## 4. Activar Copiloto con OpenAI (opcional)

La app funciona sin API externa en modo local. Para usar el Copiloto conversacional:

1. Copia `.env.example` y renómbralo `.env`.
2. Edita `.env` y agrega tu clave:

```text
OPENAI_API_KEY=tu_clave
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=medium
```

3. Cierra y vuelve a ejecutar `run-app.cmd`.
4. En el módulo **Copiloto** debe aparecer `OpenAI conectado`.

La clave se lee únicamente en el proceso del servidor local y no se envía al navegador.

## 5. Importar PDFs

La versión local usa `pdftotext` para PDFs. Si Windows no lo tiene instalado, puedes importar un archivo TXT o instalar una distribución de Poppler que incluya `pdftotext`.

## 6. Copias de seguridad

Para respaldar tus datos locales basta con copiar:

```text
data\user-data.json
```

No compartas `.env` ni lo subas a Git.
