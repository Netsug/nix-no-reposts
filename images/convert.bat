@echo off
set SVG_FILE=icon.svg
set OUTPUT_DIR=.\

REM Convert and resize to 16x16
magick "%SVG_FILE%" -transparent white -resize 16x16 -strip "%OUTPUT_DIR%icon-16.png"

REM Convert and resize to 48x48
magick "%SVG_FILE%" -transparent white -resize 48x48 -strip "%OUTPUT_DIR%icon-48.png"

REM Convert and resize to 128x128
magick "%SVG_FILE%" -transparent white -resize 128x128 -strip "%OUTPUT_DIR%icon-128.png"