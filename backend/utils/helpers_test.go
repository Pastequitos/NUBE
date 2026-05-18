package utils

import (
	"testing"
)

func TestValidateImageMimeType(t *testing.T) {
	// Case 1: Valid PNG
	pngData := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
	if err := ValidateImageMimeType(pngData); err != nil {
		t.Errorf("Expected valid PNG to pass, got error: %v", err)
	}

	// Case 2: Valid JPEG
	jpegData := []byte("\xff\xd8\xff\xe0\x00\x10JFIF\x00")
	if err := ValidateImageMimeType(jpegData); err != nil {
		t.Errorf("Expected valid JPEG to pass, got error: %v", err)
	}

	// Case 3: Valid WebP
	webpData := []byte("RIFF\x00\x00\x00\x00WEBPVP8 ")
	if err := ValidateImageMimeType(webpData); err != nil {
		t.Errorf("Expected valid WebP to pass, got error: %v", err)
	}

	// Case 4: Invalid HTML
	htmlData := []byte("<!DOCTYPE html><html><body></body></html>")
	if err := ValidateImageMimeType(htmlData); err == nil {
		t.Error("Expected HTML to fail validation, but it passed")
	}

	// Case 5: Invalid Plain Text
	txtData := []byte("Hello, world! This is just a plain text file.")
	if err := ValidateImageMimeType(txtData); err == nil {
		t.Error("Expected plain text to fail validation, but it passed")
	}
}
