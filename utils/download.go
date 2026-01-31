package utils

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

func SaveJson(fileName string, fileLocation string, data []byte) {

	var jsonData interface{} // Use interface{} to make it generic
	if err := json.Unmarshal(data, &jsonData); err != nil {
		fmt.Println("SaveJson Unmarshal Error:", err)
		return
	}

	prettyJson, err := json.MarshalIndent(jsonData, "", "  ")
	if err != nil {
		fmt.Println("SaveJson Error marshaling fileName:", fileName, "Error:", err)
		return
	}

	if err := os.MkdirAll(fileLocation, 0755); err != nil {
		fmt.Println("SaveJson Error creating data directory:", err)
		return
	}

	err = os.WriteFile(fileLocation+fileName, prettyJson, 0644)
	if err != nil {
		fmt.Println("SaveJson Error writing fileName:", fileName, "Error:", err)
		return
	}

	fmt.Println("Successfully saved fileName:", fileName)

}

func SaveImage(fileName string, fileLocation string, data []byte) {
	
	// Create directories if they don't exist
	dir := filepath.Dir(fileLocation)
	if err := os.MkdirAll(dir, 0755); err != nil {
		fmt.Println("SaveImage Error creating data directory:", err)
		return
	}

	// Save to file
	err := os.WriteFile(fileLocation+fileName, data, 0644)
	if err != nil {
		fmt.Println("SaveImage Error writing fileName:", fileName, "Error:", err)
		return
	}

	fmt.Println("Successfully saved fileName:", fileName)

}