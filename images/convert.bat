@echo off
set SVG_FILE=icon.svg
set OUTPUT_DIR=.\

REM Convert and resize to 16x16
inkscape "%SVG_FILE%" --export-type=png --export-width=16 --export-height=16 --export-filename="%OUTPUT_DIR%icon-16.png"

REM Convert and resize to 48x48
inkscape "%SVG_FILE%" --export-type=png --export-width=48 --export-height=48 --export-filename="%OUTPUT_DIR%icon-48.png"

REM Convert and resize to 128x128
inkscape "%SVG_FILE%" --export-type=png --export-width=128 --export-height=128 --export-filename="%OUTPUT_DIR%icon-128.png"

REM Convert and resize to 256x256
inkscape "%SVG_FILE%" --export-type=png --export-width=256 --export-height=256 --export-filename="%OUTPUT_DIR%icon-256.png"
