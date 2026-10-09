var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
// Le dictionnaire (src/i18n/translations.ts) reste UN seul fichier à éditer, avec fr et en côte à
// côte pour chaque clé. Au build, il est découpé en deux modules virtuels (un par langue) : le
// joueur ne télécharge que sa langue, l'autre n'arrive que s'il change de langue.
function i18nSplit() {
    var source = resolve(__dirname, 'src/i18n/translations.ts');
    var prefix = 'virtual:i18n-';
    function dictionary(lang) {
        return __awaiter(this, void 0, void 0, function () {
            var compiled, mod, flat, _i, _a, _b, key, entry;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, transformWithEsbuild(readFileSync(source, 'utf8'), source, { loader: 'ts', format: 'esm' })];
                    case 1:
                        compiled = _c.sent();
                        return [4 /*yield*/, import("data:text/javascript;base64,".concat(Buffer.from(compiled.code).toString('base64')))];
                    case 2:
                        mod = (_c.sent());
                        flat = {};
                        for (_i = 0, _a = Object.entries(mod.translations); _i < _a.length; _i++) {
                            _b = _a[_i], key = _b[0], entry = _b[1];
                            flat[key] = entry[lang];
                        }
                        return [2 /*return*/, "export default ".concat(JSON.stringify(flat))];
                }
            });
        });
    }
    return {
        name: 'i18n-split',
        resolveId: function (id) { return (id === "".concat(prefix, "fr") || id === "".concat(prefix, "en") ? "\0".concat(id) : null); },
        load: function (id) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    if (!id.startsWith("\0".concat(prefix)))
                        return [2 /*return*/, null];
                    this.addWatchFile(source);
                    return [2 /*return*/, dictionary(id.slice("\0".concat(prefix).length))];
                });
            });
        },
    };
}
// Deux points d'entrée : le site public (index.html) et l'administration
// (admin.html, servie uniquement sur le sous-domaine admin — voir
// vercel.json). Ainsi, le code du site public ne référence ni le dashboard
// admin, ni son nom de domaine.
export default defineConfig({
    plugins: [react(), i18nSplit()],
    server: {
        port: 5173,
    },
    build: {
        rollupOptions: {
            input: {
                main: 'index.html',
                admin: 'admin.html',
            },
        },
    },
});
