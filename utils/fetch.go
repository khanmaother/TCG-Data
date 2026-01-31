
package utils

import (
	"fmt"
	"io"
	"net/http"
	"os"
)

func FetchJson(url string) ([]byte, error) {
	fmt.Println("Fetch Json: ", url)
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("error fetching data: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bad status code: %d", resp.StatusCode)
	}

	// Read the response body
	bytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error fetching response: %v", err)
	}
	return bytes, nil
}

func FetchImage(url string) ([]byte, error) {
	fmt.Println("Fetch Image: ", url)
	// Make HTTP GET request
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("error fetching request: %v", err)
	}
	defer resp.Body.Close()

	// Check if the response status is OK
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bad status code: %d", resp.StatusCode)
	}

	// Read the response body
	imageBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error fetching response: %v", err)
	}


	return imageBytes, nil
}

func ReadJson(filePath string) ([]byte, error) {
	fmt.Println("Reading JSON file:", filePath)
	bytes, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("error reading file: %v", err)
	}
	return bytes, nil
}
