package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/khanmaother/TCG-Data/tcg"
)

func main() {

	tcg.GetGroupImages(2)

	// tcg.GetProductImages(68)

	// groupIds := []int{89, 80, 68, 3, 2, 1}
	// for _, groupId := range groupIds {
	//     tcg.GetGroupProducts(groupId)
	// }

}

func SaveImage(url string, filename string) error {
	// Download the image
	imageBytes, err := DownloadImage(url)
	if err != nil {
		return fmt.Errorf("error downloading image: %v", err)
	}

	// Create directories if they don't exist
	dir := filepath.Dir(filename)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("error creating directories: %v", err)
	}

	// Save to file
	err = os.WriteFile(filename, imageBytes, 0644)
	if err != nil {
		return fmt.Errorf("error saving image: %v", err)
	}

	return nil
}

func DownloadImage(url string) ([]byte, error) {
	fmt.Println("Download Image: ", url)
	// Make HTTP GET request
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("error making request: %v", err)
	}
	defer resp.Body.Close()

	// Check if the response status is OK
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bad status code: %d", resp.StatusCode)
	}

	// Read the response body
	imageBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %v", err)
	}

	return imageBytes, nil
}