; Script NSIS customizado para o instalador Captura Unificada.
; Incluído via electron-builder nsis.include.

; Cria a pasta de logs de erro durante a instalação (C:\temp\captura-unificada).
!macro customInstall
  CreateDirectory "C:\temp"
  CreateDirectory "C:\temp\captura-unificada"
!macroend
