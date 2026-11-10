const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'node_modules', 'react-native-pdf');
const sourceRoot = path.join(root, 'android', 'src', 'main', 'java');
const disposerPath = path.join(
  sourceRoot,
  'com',
  'github',
  'barteksc',
  'pdfviewer',
  'PdfFileDisposer.java',
);
const pdfViewPath = path.join(sourceRoot, 'org', 'wonday', 'pdf', 'PdfView.java');

const disposerSource = `package com.github.barteksc.pdfviewer;

public final class PdfFileDisposer {
    private PdfFileDisposer() {}

    public static Runnable detach(PDFView view) {
        final PdfFile pdfFile = view.pdfFile;
        final RenderingHandler renderingHandler = view.renderingHandler;
        if (renderingHandler != null) {
            renderingHandler.stop();
            renderingHandler.removeMessages(RenderingHandler.MSG_RENDER_TASK);
        }
        view.pdfFile = null;
        if (pdfFile == null) {
            return () -> {};
        }
        return () -> {
            if (renderingHandler == null || !renderingHandler.post(pdfFile::dispose)) {
                pdfFile.dispose();
            }
        };
    }
}
`;

const importMarker = 'import com.github.barteksc.pdfviewer.PDFView;';
const importLine = 'import com.github.barteksc.pdfviewer.PdfFileDisposer;';
const recycleAnchor = `        super.onDetachedFromWindow();
    }

    private int getPdfPageCount`;
const recycleReplacement = `        super.onDetachedFromWindow();
    }

    @Override
    public void recycle() {
        Runnable disposePdfFile = PdfFileDisposer.detach(this);
        super.recycle();
        disposePdfFile.run();
    }

    private int getPdfPageCount`;

if (!fs.existsSync(pdfViewPath)) {
  console.error('[patch-react-native-pdf] PdfView.java not found; skipping.');
  process.exit(0);
}

const pdfView = fs.readFileSync(pdfViewPath, 'utf8');

if (pdfView.includes('PdfFileDisposer.detach')) {
  console.log('[patch-react-native-pdf] Already patched.');
  process.exit(0);
}

if (!pdfView.includes(importMarker)) {
  throw new Error('[patch-react-native-pdf] Could not find PDFView import.');
}

if (!pdfView.includes(recycleAnchor)) {
  throw new Error('[patch-react-native-pdf] Could not find onDetachedFromWindow anchor.');
}

fs.mkdirSync(path.dirname(disposerPath), { recursive: true });
fs.writeFileSync(disposerPath, disposerSource);

const patched = pdfView
  .replace(importMarker, `${importMarker}\n${importLine}`)
  .replace(recycleAnchor, recycleReplacement);

fs.writeFileSync(pdfViewPath, patched);
console.log('[patch-react-native-pdf] Applied deferred PDF dispose fix.');
